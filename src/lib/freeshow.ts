export type FreeshowConfig = {
  enabled: boolean;
  url: string;
  method: 'GET' | 'POST';
  payloadTemplate: string;
};

const BOOK_MAP: { [key: string]: number } = {
  "Genesis": 1, "Exodus": 2, "Leviticus": 3, "Numbers": 4, "Deuteronomy": 5, "Joshua": 6, "Judges": 7, "Ruth": 8, "1 Samuel": 9, "2 Samuel": 10,
  "1 Kings": 11, "2 Kings": 12, "1 Chronicles": 13, "2 Chronicles": 14, "Ezra": 15, "Nehemiah": 16, "Esther": 17, "Job": 18, "Psalms": 19, "Proverbs": 20,
  "Ecclesiastes": 21, "Song of Solomon": 22, "Isaiah": 23, "Jeremiah": 24, "Lamentations": 25, "Ezekiel": 26, "Daniel": 27, "Hosea": 28, "Joel": 29, "Amos": 30,
  "Obadiah": 31, "Jonah": 32, "Micah": 33, "Nahum": 34, "Habakkuk": 35, "Zephaniah": 36, "Haggai": 37, "Zechariah": 38, "Malachi": 39,
  "Matthew": 40, "Mark": 41, "Luke": 42, "John": 43, "Acts": 44, "Romans": 45, "1 Corinthians": 46, "2 Corinthians": 47, "Galatians": 48, "Ephesians": 49, "Philippians": 50,
  "Colossians": 51, "1 Thessalonians": 52, "2 Thessalonians": 53, "1 Timothy": 54, "2 Timothy": 55, "Titus": 56, "Philemon": 57, "Hebrews": 58, "James": 59, "1 Peter": 60,
  "2 Peter": 61, "1 John": 62, "2 John": 63, "3 John": 64, "Jude": 65, "Revelation": 66
};

function getBookId(bookName: string): number {
    const b = bookName.trim().toLowerCase();
    for (const [key, value] of Object.entries(BOOK_MAP)) {
        if (key.toLowerCase().startsWith(b) || b.startsWith(key.toLowerCase())) {
            return value;
        }
    }
    return 1; // fallback
}

export const defaultFreeshowConfig: FreeshowConfig = {
  enabled: false,
  url: "http://localhost:5506/api/action",
  method: "POST",
  payloadTemplate: "{\n  \"action\": \"start_scripture\",\n  \"reference\": \"{{bookIndex}}.{{chapter}}.{{verse}}\"\n}"
};

export async function sendToFreeshow(config: FreeshowConfig, reference: any) {
  if (!config.enabled || !config.url) return;
  
  let body = config.payloadTemplate || "";
  const index = getBookId(reference.book);
  if (config.method === 'POST') {
      body = body.replace(/\{\{book\}\}/g, reference.book)
                 .replace(/\{\{bookIndex\}\}/g, String(index))
                 .replace(/\{\{chapter\}\}/g, reference.chapters[0])
                 .replace(/\{\{verse\}\}/g, reference.verses?.[0]?.[0] || '');
  }

  let finalUrl = config.url;
  if (config.method === 'GET') {
      finalUrl = finalUrl.replace('%7B%7Bbook%7D%7D', encodeURIComponent(reference.book))
         .replace('%7B%7BbookIndex%7D%7D', String(index))
         .replace('%7B%7Bchapter%7D%7D', encodeURIComponent(reference.chapters[0]))
         .replace('%7B%7Bverse%7D%7D', encodeURIComponent(reference.verses?.[0]?.[0] || ''));
  }
  
  return fetch(finalUrl, {
    method: config.method,
    headers: config.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
    body: config.method === 'POST' ? body : undefined
  });
}
