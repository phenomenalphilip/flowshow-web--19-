export const NUMBER_MAP: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15",
  sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20",
  thirty: "30", forty: "40", fifty: "50", sixty: "60", seventy: "70",
  eighty: "80", ninety: "90", hundred: "100",
  first: "1", "1st": "1", second: "2", "2nd": "2", third: "3", "3rd": "3"
};

export const BIBLE_BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
  "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther",
  "Job", "Psalms", "Psalm", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations",
  "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
  "Haggai", "Zechariah", "Malachi",
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
  "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon",
  "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"
];

const sortedBooks = [...BIBLE_BOOKS].sort((a, b) => b.length - a.length);
const booksPattern = sortedBooks.map(b => b.toLowerCase()).join('|');

const SCRIPTURE_REGEX = new RegExp(`\\b(${booksPattern})\\b\\s+(\\d+)(?:[:\\s]+(\\d+))?`, 'gi');

export function normalizeTranscript(text: string): string {
  let cleaned = text.toLowerCase();
  
  // Replace spelled out numbers and ordinals with digits
  for (const [word, digit] of Object.entries(NUMBER_MAP)) {
    const rx = new RegExp(`\\b${word}\\b`, 'g');
    cleaned = cleaned.replace(rx, digit);
  }
  
  // Strip punctuation and filler words
  cleaned = cleaned.replace(/[.,;!?"()]/g, " ");
  cleaned = cleaned.replace(/\b(chapter|verse|verses|and|the)\b/g, " ");
  
  return cleaned.replace(/\s+/g, " ").trim();
}

/**
 * Detects explicit scripture references or commands in a transcript segment.
 */
export function detectLocal(segment: string) {
  const normalized = normalizeTranscript(segment);

  // 1. Check for commands first
  if (/\b(?:next|forward)\s+(?:verse|slide|one)\b/i.test(normalized) || /\b(?:go to next)\b/i.test(normalized)) {
      return { type: 'command', command: 'next' };
  }
  if (/\b(?:previous|back|last)\s+(?:verse|slide|one)\b/i.test(normalized) || /\b(?:go to previous)\b/i.test(normalized)) {
      return { type: 'command', command: 'previous' };
  }

  // 2. Scan for actual book + chapter + verse
  let match;
  let lastMatch = null;
  SCRIPTURE_REGEX.lastIndex = 0; // reset
  
  while ((match = SCRIPTURE_REGEX.exec(normalized)) !== null) {
    lastMatch = match;
  }
  
  if (lastMatch) {
    const bookMatch = lastMatch[1];
    const chapter = parseInt(lastMatch[2], 10);
    const verseString = lastMatch[3];
    const verses = verseString ? [[parseInt(verseString, 10)]] : undefined;
    
    let formattedBook = BIBLE_BOOKS.find(b => b.toLowerCase() === bookMatch.toLowerCase()) || bookMatch;
    if (formattedBook === "Psalm") formattedBook = "Psalms";
    
    return {
      type: 'scripture',
      reference: {
        book: formattedBook,
        chapters: [chapter],
        verses: verses,
      },
      debug: {
        confidence: 100,
        originalMatch: lastMatch[0]
      }
    };
  }
  
  return null;
}

