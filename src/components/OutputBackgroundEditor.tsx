import React, { useState } from 'react';
import { Rnd } from 'react-rnd';
import { Trash, Plus, Image as ImageIcon, Video, Palette, Layers, ChevronUp, ChevronDown } from 'lucide-react';
import { FixedStage } from './FixedStage';
import { MediaElement } from '../App';

interface OutputBackgroundEditorProps {
   initialBackgrounds: MediaElement[];
   outputName: string;
   onSave: (newBgs: { backgrounds: MediaElement[] }) => void;
   onCancel: () => void;
}

export function OutputBackgroundEditor({ initialBackgrounds, outputName, onSave, onCancel }: OutputBackgroundEditorProps) {
    const [bgs, setBgs] = useState<MediaElement[]>(initialBackgrounds || []);
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    const updateLayer = (index: number, updates: Partial<MediaElement>) => {
        setBgs(prev => {
            const next = [...prev];
            next[index] = { ...next[index], ...updates };
            return next;
        });
    };

    const addColorLayer = () => {
        setBgs(prev => [
            {
               id: `bg-${Date.now()}`,
               type: 'color',
               color: '#1e3a8a',
               opacity: 100,
               layout: { x: 0, y: 0, width: 1, height: 1 }
            },
            ...prev
        ]);
        setActiveIndex(0);
    };

    const removeLayer = (index: number) => {
        setBgs(prev => prev.filter((_, i) => i !== index));
        if (activeIndex === index) setActiveIndex(null);
        else if (activeIndex !== null && activeIndex > index) setActiveIndex(activeIndex - 1);
    };

    const moveLayer = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index > 0) {
            setBgs(prev => {
                const next = [...prev];
                const temp = next[index - 1];
                next[index - 1] = next[index];
                next[index] = temp;
                return next;
            });
            if (activeIndex === index) setActiveIndex(index - 1);
            else if (activeIndex === index - 1) setActiveIndex(index);
        } else if (direction === 'down' && index < bgs.length - 1) {
            setBgs(prev => {
                const next = [...prev];
                const temp = next[index + 1];
                next[index + 1] = next[index];
                next[index] = temp;
                return next;
            });
            if (activeIndex === index) setActiveIndex(index + 1);
            else if (activeIndex === index + 1) setActiveIndex(index);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex h-screen bg-black/90 backdrop-blur-md text-white">
            <div className="flex-1 flex flex-col h-full bg-[#030303] relative border-r border-white/5">
                <div className="h-16 px-6 border-b border-white/5 flex justify-between items-center bg-[#09090B] shadow-sm relative z-10">
                    <div>
                        <h2 className="text-lg font-bold tracking-tight">Edit Background Layout</h2>
                        <p className="text-xs text-neutral-500 font-medium mt-0.5">Editing override for: {outputName}</p>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onCancel} className="px-5 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-medium transition-all">Cancel</button>
                        <button onClick={() => onSave({ backgrounds: bgs })} className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all">Save Changes</button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-12 flex flex-col items-center justify-center gap-8 custom-scrollbar relative workspace-bg">
                    <FixedStage className="w-full max-w-5xl aspect-video rounded-xl bg-black shadow-[0_0_50px_rgba(0,0,0,0.5)] border-2 border-white/5 relative overflow-hidden">
                        {(scale) => (
                            <div className="w-full h-full relative" onClick={() => setActiveIndex(null)}>
                                {bgs.length === 0 && (
                                    <div className="absolute inset-0 flex items-center justify-center text-white/20 font-bold uppercase tracking-widest text-xl">
                                        Transparent (No Background)
                                    </div>
                                )}
                                
                                {bgs.slice().reverse().map((bg, reverseIdx) => {
                                    const actualIdx = bgs.length - 1 - reverseIdx;
                                    const isActive = activeIndex === actualIdx;
                                    const zIndex = 10 + reverseIdx;
                                    
                                    return (
                                        <Rnd
                                            key={bg.id}
                                            bounds="parent"
                                            scale={scale}
                                            z={isActive ? 100 : zIndex}
                                            position={{
                                                x: (bg.layout?.x ?? 0) * 1920,
                                                y: (bg.layout?.y ?? 0) * 1080
                                            }}
                                            size={{
                                                width: (bg.layout?.width ?? 1) * 1920,
                                                height: (bg.layout?.height ?? 1) * 1080
                                            }}
                                            onDragStart={() => setActiveIndex(actualIdx)}
                                            onDragStop={(e, d) => {
                                                updateLayer(actualIdx, {
                                                    layout: {
                                                        ...bg.layout,
                                                        x: d.x / 1920,
                                                        y: d.y / 1080,
                                                        width: bg.layout?.width ?? 1,
                                                        height: bg.layout?.height ?? 1
                                                    }
                                                });
                                            }}
                                            onResizeStart={() => setActiveIndex(actualIdx)}
                                            onResizeStop={(e, direction, refElem, delta, position) => {
                                                updateLayer(actualIdx, {
                                                    layout: {
                                                        x: position.x / 1920,
                                                        y: position.y / 1080,
                                                        width: refElem.offsetWidth / 1920,
                                                        height: refElem.offsetHeight / 1080
                                                    }
                                                });
                                            }}
                                            className={`transition-colors border-[2px] ${isActive ? 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]' : 'border-transparent hover:border-white/20'}`}
                                            onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(actualIdx); }}
                                            onClick={(e) => { e.stopPropagation(); setActiveIndex(actualIdx); }}
                                        >
                                            <div className="w-full h-full relative" style={{ opacity: (bg.opacity ?? 100) / 100 }}>
                                                {bg.type === 'color' && <div className="w-full h-full" style={{ backgroundColor: bg.color || '#000' }} />}
                                                {bg.type === 'image' && <img src={bg.url} className="w-full h-full object-cover pointer-events-none" alt="bg layer" />}
                                                {bg.type === 'video' && <video src={bg.url} className="w-full h-full object-cover pointer-events-none" autoPlay loop muted playsInline />}
                                                
                                                {isActive && (
                                                    <div className="absolute -top-6 left-0 text-[10px] uppercase font-bold tracking-widest bg-emerald-500 text-white px-2 py-0.5 rounded-t-sm shadow-md">
                                                        Layer {actualIdx + 1}
                                                    </div>
                                                )}
                                            </div>
                                        </Rnd>
                                    );
                                })}
                            </div>
                        )}
                    </FixedStage>
                </div>
            </div>

            <div className="w-80 bg-[#09090B] h-full flex flex-col shrink-0 shadow-2xl relative z-20 overflow-hidden">
                <div className="p-6 border-b border-white/5 space-y-4 shrink-0">
                    <h2 className="text-sm font-bold tracking-wide text-white flex items-center gap-2"><Layers size={18} /> Layers</h2>
                    <div className="flex gap-2">
                        <button onClick={addColorLayer} className="flex-1 py-3 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-bold transition-all flex flex-col items-center gap-1">
                            <Palette size={16} /> Color
                        </button>
                        <label className="flex-1 py-3 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer">
                            <ImageIcon size={16} /> Media
                            <input 
                                type="file" 
                                accept="image/*,video/*" 
                                className="hidden" 
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const type = file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|mov)$/i) ? 'video' : 'image';
                                    const reader = new FileReader();
                                    reader.onload = (event) => {
                                        const dataUrl = event.target?.result as string;
                                        setBgs(prev => [{
                                           id: `bg-${Date.now()}`,
                                           type,
                                           url: dataUrl,
                                           fileName: file.name,
                                           opacity: 100,
                                           layout: { x: 0, y: 0, width: 1, height: 1 }
                                        }, ...prev]);
                                        setActiveIndex(0);
                                    };
                                    reader.readAsDataURL(file);
                                    e.target.value = '';
                                }}
                            />
                        </label>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2">
                    {bgs.length === 0 && (
                        <div className="text-center text-xs text-neutral-600 font-medium py-8 p-4 bg-white/5 rounded-lg border border-white/5 border-dashed">
                            No active backgrounds.<br/>Click a button above to add one.
                        </div>
                    )}
                    {bgs.map((bg, idx) => {
                        const isActive = activeIndex === idx;
                        return (
                            <div key={bg.id} className={`p-4 rounded-xl border transition-all cursor-pointer ${isActive ? 'bg-white/10 border-emerald-500/50 shadow-md' : 'bg-black border-white/5 hover:border-white/20'}`} onClick={() => setActiveIndex(idx)}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2 text-sm font-bold text-neutral-200">
                                        {bg.type === 'color' ? <Palette size={14} className="text-blue-400"/> : bg.type === 'video' ? <Video size={14} className="text-purple-400"/> : <ImageIcon size={14} className="text-emerald-400"/>}
                                        {bg.type === 'color' ? 'Solid Color' : bg.fileName || 'Media Layer'}
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={(e) => { e.stopPropagation(); moveLayer(idx, 'up'); }} disabled={idx === 0} className="p-1 hover:bg-white/10 rounded disabled:opacity-30"><ChevronUp size={14} /></button>
                                        <button onClick={(e) => { e.stopPropagation(); moveLayer(idx, 'down'); }} disabled={idx === bgs.length - 1} className="p-1 hover:bg-white/10 rounded disabled:opacity-30"><ChevronDown size={14} /></button>
                                        <button onClick={(e) => { e.stopPropagation(); removeLayer(idx); }} className="p-1 hover:bg-red-500/20 text-red-500 rounded"><Trash size={14} /></button>
                                    </div>
                                </div>
                                
                                {isActive && (
                                    <div className="space-y-4 mt-4 pt-4 border-t border-white/10">
                                        {bg.type === 'color' && (
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Color</label>
                                                <div className="flex items-center gap-3">
                                                    <input type="color" value={bg.color || '#000000'} onChange={(e) => updateLayer(idx, { color: e.target.value })} className="w-8 h-8 rounded cursor-pointer border-none bg-transparent" />
                                                    <input type="text" value={bg.color || '#000000'} onChange={(e) => updateLayer(idx, { color: e.target.value })} className="flex-1 bg-white/5 border border-white/10 rounded text-sm px-2 py-1 outline-none text-white font-mono" />
                                                </div>
                                            </div>
                                        )}
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Opacity</label>
                                                <span className="text-xs text-neutral-300 font-mono">{bg.opacity ?? 100}%</span>
                                            </div>
                                            <input type="range" min="0" max="100" value={bg.opacity ?? 100} onChange={(e) => updateLayer(idx, { opacity: parseInt(e.target.value) })} className="w-full accent-emerald-500" />
                                        </div>
                                        <button onClick={() => updateLayer(idx, { layout: { x: 0, y: 0, width: 1, height: 1 } })} className="w-full text-xs font-bold py-2 bg-white/5 hover:bg-white/10 rounded border border-white/5">Reset Layer Size</button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
