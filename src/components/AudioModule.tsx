import { useEffect, useState, useRef } from "react";
import { Mic, MicOff, BookOpen, Activity, AlertCircle, Sparkles, Check, ChevronRight, Settings, X, Send, History } from "lucide-react";
import { detectLocal } from "../lib/parser";
import { detectVerseFromContext } from "../lib/ai";
import { FreeshowConfig, defaultFreeshowConfig, sendToFreeshow } from "../lib/freeshow";

interface AudioModuleProps {
  onVerseDetected: (reference: any) => void;
  onCommand?: (command: 'next' | 'previous') => void;
  forceStopTrigger?: number;
  activeBibleData?: any;
  bibleList?: {id: string, name: string}[];
  activeBibleId?: string | null;
  onBibleChange?: (id: string) => void;
}

const getBibleText = (reference: any, activeBibleData: any) => {
  if (!activeBibleData || !reference) return "";
  const bookSearch = reference.book;
  const chapterSearch = reference.chapters?.[0];
  const verseStart = reference.verses?.[0]?.[0] || 1;
  const verseEnd = reference.verses?.[0]?.[1] || verseStart;
  
  if (!bookSearch || !chapterSearch) return "";

  const book = activeBibleData.books.find((b: any) => b.name.toLowerCase().startsWith(String(bookSearch).toLowerCase()));
  if (book) {
    const chapter = book.chapters.find((c: any) => c.c === chapterSearch);
    if (chapter) {
      const requestedVerses = chapter.verses.filter((v: any) => v.v >= verseStart && v.v <= verseEnd);
      if (requestedVerses.length > 0) {
          return requestedVerses.map((v: any) => v.lines.join('\n')).join('\n\n');
      }
    }
  }
  return "Verse text not found in active Bible.";
};

export function AudioModule({ onVerseDetected, onCommand, forceStopTrigger, activeBibleData, bibleList, activeBibleId, onBibleChange }: AudioModuleProps) {
  const onVerseDetectedRef = useRef(onVerseDetected);
  const onCommandRef = useRef(onCommand);

  useEffect(() => {
    onVerseDetectedRef.current = onVerseDetected;
    onCommandRef.current = onCommand;
  }, [onVerseDetected, onCommand]);

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastDetected, setLastDetected] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>('');
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [deepgramKey, setDeepgramKey] = useState<string>('');
  
  // FreeShow settings

  const [config, setConfig] = useState<FreeshowConfig>(defaultFreeshowConfig);
  const [isAiEnabled, setIsAiEnabled] = useState(false);
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  // Load config from local storage
  useEffect(() => {
    const saved = localStorage.getItem('freeshow_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
          if (parsed.url === 'http://localhost:5506' || parsed.url === 'http://127.0.0.1:8080/api/action') {
             saveConfig(defaultFreeshowConfig);
          } else {
             setConfig(parsed);
          }
      } catch (e) {
        console.error("Failed to parse saved config");
      }
    }
    
    const savedDeepgram = localStorage.getItem('deepgram_key');
    if (savedDeepgram) {
       setDeepgramKey(savedDeepgram);
    }
    const savedGeminiKey = localStorage.getItem('gemini_key');
    if (savedGeminiKey) {
       setGeminiKey(savedGeminiKey);
    }
    const savedAiEnabled = localStorage.getItem('ai_enabled');
    if (savedAiEnabled) {
       setIsAiEnabled(savedAiEnabled === 'true');
    }
  }, []);

  // Save config to local storage
  const saveConfig = (newConfig: FreeshowConfig) => {
    setConfig(newConfig);
    localStorage.setItem('freeshow_config', JSON.stringify(newConfig));
  };
  
  const saveDeepgramConfig = (key: string) => {
    setDeepgramKey(key);
    localStorage.setItem('deepgram_key', key);
  };

  const saveGeminiConfig = (key: string) => {
    setGeminiKey(key);
    localStorage.setItem('gemini_key', key);
  };
  
  const saveAiEnabledConfig = (val: boolean) => {
    setIsAiEnabled(val);
    localStorage.setItem('ai_enabled', String(val));
  };
  
  // We use a ref to store the recognition instance so we can stop it
  const recognitionRef = useRef<any>(null);
  const deepgramSocketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const lastResolvedMatchIndexRef = useRef<number>(0);
  const transcriptRef = useRef(transcript);
  const latestDetectedJSONRef = useRef<string | null>(null);
  const accumulatedTranscriptRef = useRef<string>("");
  const shouldBeListeningRef = useRef<boolean>(false);
  const lastQueriedTranscriptRef = useRef<string>("");

  // Keep transcriptRef up to date across renders for setInterval
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Hook to send to FreeShow when lastDetected changes
  useEffect(() => {
    if (lastDetected && config.enabled) {
      setIntegrationStatus('sending');
      sendToFreeshow(config, lastDetected.reference)
        .then(() => setIntegrationStatus('success'))
        .catch(() => setIntegrationStatus('error'));
    }
  }, [lastDetected, config]);

  useEffect(() => {
    // Stage 3 Contextual Buffering & AI trigger
    if (!isListening || !isAiEnabled) return;
    
    let isFetching = false;
    
    const interval = setInterval(async () => {
      if (isFetching) return;
      
      const currentTranscript = transcriptRef.current;
      if (!currentTranscript) return;

      const startIndex = lastResolvedMatchIndexRef.current || 0;
      const unprocessedTranscript = currentTranscript.substring(startIndex);
      
      const words = unprocessedTranscript.split(/\s+/).filter(Boolean);
      const recentWords = words.slice(-30).join(" ");
      
      if (words.length >= 2 && recentWords !== lastQueriedTranscriptRef.current) {
        lastQueriedTranscriptRef.current = recentWords;
        const aiCheckPoint = currentTranscript.length;
        
        isFetching = true;
        setIsAiProcessing(true);
        
        try {
          const aiResult = await detectVerseFromContext(recentWords, geminiKey || undefined);
          
          if (aiResult) {
            if (aiResult.command && onCommandRef.current) {
                const now = Date.now();
                if (now - ((window as any).lastCmdTime || 0) > 2000) {
                   (window as any).lastCmdTime = now;
                   onCommandRef.current(aiResult.command as any);
                }
                lastResolvedMatchIndexRef.current = Math.max(lastResolvedMatchIndexRef.current, aiCheckPoint);
                return;
            }

            if (lastResolvedMatchIndexRef.current > aiCheckPoint) {
              return;
            }

            if (aiResult.confidence && aiResult.confidence >= 95) {
              pushToScreenAndHistory(aiResult);
              lastResolvedMatchIndexRef.current = Math.max(lastResolvedMatchIndexRef.current, aiCheckPoint);
            } else {
              setSuggestions((prev) => {
                const exists = prev.some(
                  (s) => JSON.stringify(s.reference) === JSON.stringify(aiResult.reference)
                );
                if (exists) return prev;
                return [aiResult, ...prev].slice(0, 5);
              });
            }
          }
        } catch (err) {
          console.error(err);
        } finally {
          setIsAiProcessing(false);
          isFetching = false;
        }
      }
    }, 2500); // Polling every 2.5 seconds to balance performance

    return () => clearInterval(interval);
  }, [isListening, isAiEnabled, geminiKey]);

  const startDeepgram = (stream: MediaStream) => {
    if (!deepgramKey) {
        setErrorMsg("Deepgram API Key is missing.");
        return;
    }
    
    const socket = new WebSocket('wss://api.deepgram.com/v1/listen?smart_format=true&model=nova-2&interim_results=true', [
      'token',
      deepgramKey
    ]);
    
    deepgramSocketRef.current = socket;
    
    socket.onopen = () => {
      setIsListening(true);
      setIsStarting(false);
      setErrorMsg(null);
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.addEventListener('dataavailable', event => {
        if (event.data.size > 0 && socket.readyState === 1) {
          socket.send(event.data);
        }
      });
      
      mediaRecorder.start(250);
    };
    
    socket.onmessage = (message) => {
      const received = JSON.parse(message.data);
      const output = received.channel?.alternatives[0]?.transcript;
      
      if (output) {
        let fullTranscript = "";
        if (received.is_final) {
          accumulatedTranscriptRef.current += " " + output;
          fullTranscript = accumulatedTranscriptRef.current;
        } else {
          fullTranscript = accumulatedTranscriptRef.current + " " + output;
        }
        
        setTranscript(fullTranscript);
        
        const unparsed = fullTranscript.substring(lastResolvedMatchIndexRef.current || 0);
        const localDetection = detectLocal(unparsed);
        if (localDetection) {
          if (localDetection.type === 'scripture') {
              pushToScreenAndHistory(localDetection);
          } else if (localDetection.type === 'command') {
              const now = Date.now();
              if (now - ((window as any).lastCmdTime || 0) > 2000) {
                 (window as any).lastCmdTime = now;
                 if (onCommandRef.current) onCommandRef.current(localDetection.command as any);
              }
              lastResolvedMatchIndexRef.current = fullTranscript.length;
          }
        }
      }
    };
    
    socket.onclose = () => {
      setIsListening(false);
      try {
         if (mediaRecorderRef.current?.state !== 'inactive') {
             mediaRecorderRef.current?.stop();
         }
      } catch (e) {}
    };
    
    socket.onerror = (error) => {
      console.error(error);
      setIsStarting(false);
      setIsListening(false);
      setErrorMsg("Deepgram WebSocket error. Check if your API key is valid.");
    };
  };

  const startWebSpeech = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMsg("Speech Recognition not supported in this browser. Try Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setIsStarting(false);
      setErrorMsg(null);
    };
    
    recognition.onend = () => {
      if (shouldBeListeningRef.current) {
        accumulatedTranscriptRef.current = transcriptRef.current;
        try {
          recognition.start();
        } catch (e) {
          console.error("Auto-restart error", e);
          setIsListening(false);
          shouldBeListeningRef.current = false;
        }
      } else {
        setIsListening(false);
      }
    };
    
    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') return;
      console.error("Speech recognition error", event.error);
      setIsStarting(false);
      
      const isElectron = navigator.userAgent.toLowerCase().includes('electron') || !!(window as any).electronAPI;
      
      if (isElectron && event.error === 'network') {
         shouldBeListeningRef.current = false;
         setIsListening(false);
         setErrorMsg("Electron requires Google Speech API keys to use the native Web Speech API. Please add them to your Electron build, or use a 3rd-party STT service (like Deepgram/OpenAI).");
         return;
      }

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        shouldBeListeningRef.current = false;
        setIsListening(false);
        setErrorMsg(`Browser blocked microphone. Please ensure permissions are granted in your browser settings, then refresh.`);
      }
    };
    
    recognition.onresult = (event: any) => {
      let sessionTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        sessionTranscript += event.results[i][0].transcript;
      }
      
      const fullTranscript = accumulatedTranscriptRef.current + " " + sessionTranscript;
      setTranscript(fullTranscript);
      
      const unparsed = fullTranscript.substring(lastResolvedMatchIndexRef.current || 0);
      const localDetection = detectLocal(unparsed);
      if (localDetection) {
        if (localDetection.type === 'scripture') {
            pushToScreenAndHistory(localDetection);
        } else if (localDetection.type === 'command') {
            const now = Date.now();
            if (now - ((window as any).lastCmdTime || 0) > 2000) {
               (window as any).lastCmdTime = now;
               if (onCommandRef.current) onCommandRef.current(localDetection.command as any);
            }
            lastResolvedMatchIndexRef.current = fullTranscript.length;
        }
      }
    };

    try {
       recognitionRef.current = recognition;
       recognition.start();
    } catch (e: any) {
       setIsStarting(false);
       console.error("Error starting speech recognition", e);
       setErrorMsg("Failed to start speech recognition: " + (e.message || String(e)));
    }
  };

  useEffect(() => {
    return () => {
       recognitionRef.current?.stop();
       deepgramSocketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' as any });
        if (result.state === 'granted') {
           setPermissionGranted(true);
           fetchMics();
        }
        result.onchange = () => {
          if (result.state === 'granted') {
            setPermissionGranted(true);
            fetchMics();
          } else {
            setPermissionGranted(false);
            setMics([]);
          }
        }
      } catch (err) {
        // Some browsers don't support 'microphone' permission queries
        console.warn('Permission query not supported', err);
      }
    }
  };

  const requestPermission = async () => {
     try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
           const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
           stream.getTracks().forEach(t => t.stop());
           setPermissionGranted(true);
           fetchMics();
           setErrorMsg(null);
        }
     } catch (err) {
        setErrorMsg("Microphone permission denied.");
     }
  };

  const fetchMics = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        setMics(audioInputs);
        if (audioInputs.length > 0 && !selectedMic) {
          setSelectedMic(audioInputs[0].deviceId);
        }
      }
    } catch (e) {
      console.warn('Failed to enumerate devices', e);
    }
  };

  useEffect(() => {
    if (forceStopTrigger && forceStopTrigger > 0 && isListening) {
      shouldBeListeningRef.current = false;
      try { recognitionRef.current?.stop(); } catch (e) {}
      if (deepgramSocketRef.current && deepgramSocketRef.current.readyState === 1) {
          deepgramSocketRef.current.close();
      }
      try {
         if (mediaRecorderRef.current?.state !== 'inactive') {
             mediaRecorderRef.current?.stop();
         }
      } catch (e) {}
      setIsListening(false);
    }
  }, [forceStopTrigger]);

  const [isStarting, setIsStarting] = useState(false);

  const toggleListening = async () => {
    if (isListening || isStarting) {
      setIsStarting(false);
      shouldBeListeningRef.current = false;
      recognitionRef.current?.stop();
      if (deepgramSocketRef.current && deepgramSocketRef.current.readyState === 1) {
          deepgramSocketRef.current.close();
      }
      try {
         if (mediaRecorderRef.current?.state !== 'inactive') {
             mediaRecorderRef.current?.stop();
         }
      } catch (e) {}
      setIsListening(false);
    } else {
      setIsStarting(true);
      setErrorMsg(null);
      try {
        let stream: MediaStream | null = null;
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
           const constraints = selectedMic ? { audio: { deviceId: { exact: selectedMic } } } : { audio: true };
           
           // Wrap in a timeout in case Electron/Browser hangs on permission request
           const streamPromise = navigator.mediaDevices.getUserMedia(constraints);
           const timeoutPromise = new Promise<never>((_, reject) => {
               setTimeout(() => reject(new Error("Microphone activation timed out. Check constraints or permissions.")), 10000);
           });
           stream = await Promise.race([streamPromise, timeoutPromise]);
           
           if (!permissionGranted) {
               setPermissionGranted(true);
               fetchMics();
           }
        }

        shouldBeListeningRef.current = true;
        accumulatedTranscriptRef.current = "";
        lastQueriedTranscriptRef.current = "";
        setTranscript("");
        setLastDetected(null);
        setSuggestions([]);
        lastResolvedMatchIndexRef.current = 0;
        
        if (deepgramKey && stream) {
            startDeepgram(stream);
        } else {
            if (stream) stream.getTracks().forEach(track => track.stop());
            startWebSpeech();
        }
      } catch (err: any) {
        setIsStarting(false);
        console.error("Microphone error:", err);
        setErrorMsg(`Microphone access failed: ${err.message || String(err)}`);
      }
    }
  };

  const clearAndRestart = () => {
    accumulatedTranscriptRef.current = "";
    transcriptRef.current = "";
    lastQueriedTranscriptRef.current = "";
    setTranscript("");
    setLastDetected(null);
    setSuggestions([]);
    lastResolvedMatchIndexRef.current = 0;
    if (isListening) {
      if (deepgramKey) return; // deepgram doesn't need restart to clear, it's continuous
      recognitionRef.current?.stop();
    }
  };

  const pushToScreenAndHistory = (result: any) => {
    const stringified = JSON.stringify(result.reference);
    if (stringified !== latestDetectedJSONRef.current) {
      latestDetectedJSONRef.current = stringified;
      setLastDetected(result);
      setHistory(prev => {
        if (prev.length > 0) {
           const prevRef = prev[0].reference;
           const newRef = result.reference;
           if (prevRef.book === newRef.book && prevRef.chapters[0] === newRef.chapters[0]) {
               // they match in book and chapter
               if (!prevRef.verses || prevRef.verses.length === 0) {
                  // The previous was just a chapter, Replace it with the new complete verse
                  return [result, ...prev.slice(1)].slice(0, 20); 
               }
           }
        }

        if (prev.length > 0 && JSON.stringify(prev[0].reference) === stringified) {
          return prev;
        }
        return [result, ...prev].slice(0, 20); // Keep last 20
      });
      if (onVerseDetectedRef.current) {
         onVerseDetectedRef.current(result.reference);
      }
    }
  };

  const handleSelectSuggestion = (suggestion: any) => {
    pushToScreenAndHistory(suggestion);
  };

  return (
    <div className="flex-1 w-full h-full min-h-0 min-w-0 flex flex-col bg-[#09090B] text-neutral-300 p-6 md:p-8 overflow-hidden">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between shrink-0 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1 text-white">Live Audio Transcriber</h1>
          <p className="text-neutral-500 text-sm font-medium">
            Speak naturally. Matches push directly to the live output screen.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {permissionGranted && mics.length > 0 ? (
            <select 
              className="bg-[#121214] border border-white/10 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-white/30 max-w-[200px] truncate"
              value={selectedMic}
              onChange={(e) => setSelectedMic(e.target.value)}
              title="Note: The Web Speech API might still use the system default mic. Select here to nudge it, but check your browser site settings if it's not picking it up."
            >
              {mics.map(m => <option key={m.deviceId} value={m.deviceId}>{m.label || `Microphone ${m.deviceId.substring(0,4)}`}</option>)}
            </select>
          ) : (
            <button onClick={requestPermission} className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold transition-all shadow-md">
              Allow Microphone
            </button>
          )}
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 border border-white/10 bg-[#121214] rounded-full text-neutral-400 hover:text-white hover:bg-white/5 transition-all shadow-sm"
            title="Integration Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6">
        {/* LEFT COLUMN: Controls & Transcript */}
        <div className="flex-[3] flex flex-col min-w-0 bg-[#121214] rounded-3xl border border-white/5 p-6 shadow-2xl relative">
          <div className="flex items-center justify-between mb-6 shrink-0">
            <div className="flex items-center space-x-4">
              <div className={`p-3 rounded-full ${isListening ? 'bg-red-500/10 text-red-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'bg-[#030303] text-neutral-500 border border-white/5'}`}>
                {isListening ? <Activity size={24} /> : <MicOff size={24} />}
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">{isListening ? "Listening..." : "Microphone Off"}</h2>
                <div className="flex items-center space-x-2 text-sm text-neutral-500 font-medium mt-0.5">
                  <p>Try: "Let's open to John chapter 3 verse 16"</p>
                  {isAiProcessing && (
                    <span className="flex items-center space-x-1 text-purple-400 animate-pulse font-semibold">
                      <Sparkles size={14} />
                      <span>AI Thinking...</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={clearAndRestart}
                className="px-5 py-2.5 rounded-full font-bold transition-all bg-[#030303] border border-white/5 hover:bg-white/5 text-neutral-300 shadow-sm text-sm"
              >
                Clear
              </button>
              <button
                onClick={toggleListening}
                disabled={isStarting}
                className={`px-6 py-2.5 rounded-full font-bold transition-all shadow-lg text-sm ${
                  isListening 
                    ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/30 shadow-red-500/10" 
                    : isStarting
                      ? "bg-neutral-800 text-neutral-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20"
                }`}
              >
                {isStarting ? "Starting..." : isListening ? "Stop listening" : "Start listening"}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-4 p-4 bg-red-900/10 border border-red-500/30 rounded-xl flex items-start space-x-3 text-red-400 shadow-sm shrink-0">
              <AlertCircle size={20} className="mt-0.5 shrink-0" />
              <div>
                <h3 className="font-bold text-sm tracking-tight">Microphone Issue</h3>
                <p className="text-sm font-medium mt-1">{errorMsg}</p>
              </div>
            </div>
          )}

          <div className="flex-1 bg-[#030303] rounded-2xl p-5 border border-white/5 shadow-inner flex flex-col min-h-0 relative">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Live Transcript (Last 40 words)</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col justify-end">
              <p className="text-lg text-neutral-200 font-medium leading-relaxed">
                {transcript ? (
                  transcript.split(/\s+/).filter(Boolean).length > 40 
                    ? "..." + transcript.split(/\s+/).filter(Boolean).slice(-40).join(" ")
                    : transcript
                ) : (
                  <span className="text-neutral-600 italic">Words will appear here...</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Output & AI Suggestions */}
        <div className="flex-[2] flex flex-col gap-6 min-w-0">
          
          {/* History / Pushed Box */}
          <div className="flex-1 flex flex-col bg-[#121214] border border-white/5 rounded-3xl p-6 min-h-0 shadow-lg">
            <div className="flex flex-wrap items-center justify-between mb-4 shrink-0 gap-2">
               <div className="flex items-center space-x-2">
                 <History size={16} className="text-blue-400" />
                 <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Pushed to Screen History</span>
               </div>
               {bibleList && bibleList.length > 0 && onBibleChange && (
                 <select 
                   value={activeBibleId || ''} 
                   onChange={(e) => onBibleChange(e.target.value)}
                   className="bg-[#030303] text-xs text-neutral-300 border border-white/10 rounded-lg px-2 py-1 outline-none focus:border-blue-500"
                 >
                   {bibleList.map(b => (
                     <option key={b.id} value={b.id}>{b.name}</option>
                   ))}
                 </select>
               )}
            </div>
            {history.length > 0 ? (
               <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-3 pr-2">
                 {history.map((histItem, index) => (
                    <div key={index} className={`w-full text-left p-4 rounded-xl border ${index === 0 ? "bg-blue-900/20 border-blue-500/30 shadow-[0_4px_20px_rgba(59,130,246,0.1)]" : "bg-[#030303] border-white/5"} transition-all`}>
                      <div className="flex justify-between items-center">
                         <span className={`font-bold tracking-tight ${index === 0 ? "text-blue-300 text-lg" : "text-neutral-400 text-sm"}`}>
                           {histItem.reference.book} {histItem.reference.chapters[0]}:{histItem.reference.verses?.[0]?.[0] || '1'}
                         </span>
                         {index === 0 && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ml-2">Live</span>}
                      </div>
                      <p className={`text-[11px] mt-2 leading-relaxed ${index === 0 ? "text-blue-100" : "text-neutral-500"}`}>
                         {getBibleText(histItem.reference, activeBibleData) || JSON.stringify(histItem.reference)}
                      </p>
                    </div>
                 ))}
               </div>
            ) : (
               <div className="flex-1 flex items-center justify-center bg-[#030303] rounded-2xl border border-white/5 shadow-inner">
                 <p className="text-xs font-medium text-neutral-600 text-center px-4">
                   Waiting to detect a Bible reference...
                 </p>
               </div>
            )}
          </div>

          <div className="flex-1 flex flex-col bg-[#121214] border border-white/5 rounded-3xl p-6 min-h-0 shadow-lg">
            <div className="flex items-center space-x-2 mb-4 shrink-0">
              <Sparkles size={16} className="text-purple-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400">
                Detected Scriptures (Click to Send)
              </span>
            </div>
            {suggestions.length > 0 ? (
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-3 pr-2">
                {suggestions.map((suggestion, index) => {
                  const isSelected = 
                    lastDetected && 
                    JSON.stringify(lastDetected.reference) === JSON.stringify(suggestion.reference);

                  return (
                    <button
                      key={index}
                      onClick={() => handleSelectSuggestion(suggestion)}
                      className={`w-full text-left flex items-center justify-between p-4 rounded-xl border transition-all ${
                        isSelected
                          ? "bg-purple-600 border-transparent text-white shadow-lg shadow-purple-500/20"
                          : "bg-[#030303] border-white/5 hover:border-purple-500/30 text-neutral-300 hover:bg-[#121214] shadow-sm"
                      }`}
                    >
                      <div className="min-w-0 pr-3">
                        <p className={`font-bold tracking-tight truncate ${isSelected ? "text-white text-base" : "text-purple-300 text-sm"}`}>
                          {suggestion.reference.book} {suggestion.reference.chapters[0]}:{suggestion.reference.verses?.[0]?.[0] || '1'}
                        </p>
                        <p className={`text-[10px] mt-1 font-medium ${isSelected ? "text-purple-200" : "text-neutral-500"} truncate`}>
                          {suggestion.confidence ? `${suggestion.confidence}% match. ` : ''}From: "{suggestion.debug.originalMatch}"
                        </p>
                      </div>
                      {isSelected ? (
                        <div className="flex-shrink-0 flex items-center justify-center bg-white/20 rounded-full w-5 h-5">
                          <Check size={12} className="text-white" />
                        </div>
                      ) : (
                        <Send size={16} className="text-purple-500 opacity-50 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center bg-[#030303] rounded-2xl border border-white/5 shadow-inner">
                 <p className="text-xs font-medium text-neutral-600 text-center px-4">
                   {isAiEnabled 
                     ? "Listening for paraphrases & context... AI matches will appear here." 
                     : "AI smart match is disabled. Go to Settings to enable it for paraphrase detection."}
                 </p>
              </div>
            )}
          </div>
        </div>
      </div>

       {/* Settings Modal - Kept in tact but styled darker */}
       {isSettingsOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col">
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-pointer" 
            onClick={() => setIsSettingsOpen(false)}
          ></div>
          
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col justify-end sm:justify-center items-center relative z-10 pointer-events-none">
            <div 
              className="bg-[#09090B] sm:rounded-2xl shadow-2xl w-full max-w-lg flex flex-col sm:border border-white/10 animate-in slide-in-from-bottom duration-200 max-h-[90vh] pointer-events-auto rounded-t-2xl text-neutral-300 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-[#030303]">
                <h2 className="text-lg font-bold flex items-center text-white tracking-tight">
                  <Settings size={18} className="mr-2 text-blue-500" />
                  Integration Settings
                </h2>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between p-5 border border-white/5 rounded-xl bg-[#030303] shadow-sm">
                  <div>
                    <h3 className="font-bold text-white tracking-tight">Enable Webhook</h3>
                    <p className="text-sm text-neutral-400 mt-1 font-medium">Send requests to an external software</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={config.enabled}
                      onChange={(e) => saveConfig({...config, enabled: e.target.checked})}
                    />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 border border-white/5 peer-checked:border-blue-500 shadow-inner"></div>
                  </label>
                </div>

                <div className={config.enabled ? "opacity-100 space-y-4" : "opacity-30 pointer-events-none space-y-4 transition-opacity"}>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1 mb-2">Webhook URL</label>
                    <input 
                      type="text" 
                      value={config.url}
                      onChange={(e) => saveConfig({...config, url: e.target.value})}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-blue-500 font-mono text-sm transition-colors text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1 mb-2">Payload Template</label>
                    <p className="text-xs text-neutral-400 pl-1 mb-2">
                       Available variables: {'{{book}}'}, {'{{bookIndex}}'}, {'{{chapter}}'}, {'{{verse}}'}
                    </p>
                    <textarea 
                      value={config.payloadTemplate}
                      onChange={(e) => saveConfig({...config, payloadTemplate: e.target.value})}
                      rows={5}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-blue-500 font-mono text-sm transition-colors text-white resize-none"
                    />
                  </div>
                </div>

                <div className="pt-4 mt-2 border-t border-white/5 space-y-4">
                   <div className="flex items-center justify-between p-5 border border-white/5 rounded-xl bg-[#030303] shadow-sm">
                     <div>
                       <h3 className="font-bold text-white tracking-tight">Enable AI Smart Match</h3>
                       <p className="text-sm text-neutral-400 mt-1 font-medium">Detect paraphrases and context in speech</p>
                     </div>
                     <label className="relative inline-flex items-center cursor-pointer">
                       <input 
                         type="checkbox" 
                         className="sr-only peer"
                         checked={isAiEnabled}
                         onChange={(e) => saveAiEnabledConfig(e.target.checked)}
                       />
                       <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600 border border-white/5 peer-checked:border-purple-500 shadow-inner"></div>
                     </label>
                   </div>

                   <div className={isAiEnabled ? "opacity-100 space-y-4" : "opacity-30 pointer-events-none space-y-4 transition-opacity"}>
                     <div>
                        <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1 mb-2">Gemini API Key</label>
                        <p className="text-xs text-neutral-400 pl-1 mb-2">
                          Required for AI Match if running securely via local Electron app.
                        </p>
                        <input 
                          type="password" 
                          value={geminiKey}
                          onChange={(e) => saveGeminiConfig(e.target.value)}
                          placeholder="AIzaSy..."
                          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-purple-500 font-mono text-sm transition-colors text-white"
                        />
                     </div>
                   </div>
                </div>

                <div className="pt-4 mt-2 border-t border-white/5 space-y-4">
                   <div>
                      <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1 mb-2">Deepgram API Key (Optional)</label>
                      <p className="text-xs text-neutral-400 pl-1 mb-2">
                        Required if you are using Electron, or standard Web Speech is not giving sufficient output. You can get a free API key at <a href="https://console.deepgram.com" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline">console.deepgram.com</a>.
                      </p>
                      <input 
                        type="password" 
                        value={deepgramKey}
                        onChange={(e) => saveDeepgramConfig(e.target.value)}
                        placeholder="sk-..."
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-blue-500 font-mono text-sm transition-colors text-white"
                      />
                   </div>
                </div>
              </div>

              <div className="px-6 py-5 bg-[#030303] border-t border-white/5 flex justify-end">
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-8 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 font-bold tracking-tight shadow-md shadow-blue-500/20 transition-all"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
