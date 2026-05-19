const text = `
[Verse]
In humble adoration we bow before your throne
As we come before your presence we honour you alone
So we lift up our voices as trumpets heralding you
You are the king of glory so this is what we do

[Chorus:]
We worship you today [x4]

[Ad lib:]
Father how we love you today and we worship you just because of who you are
O-o-o-o-o-o-o-o-o-h

[Verse:]
In humble adoration we bow before your throne
As we come before your presence we honour you alone
So we lift up our voices as trumpets heralding you
You are the king of glory so this is what we do

[Chorus]
We worship you today [x8]

We honour you today [x8]
`;

const processLyricsToSlides = (text: string) => {
    const normalizedText = text.replace(/\r\n/g, '\n');
    
    // Add : to genericBracketRegex
    const genericBracketRegex = /^\[(.*?)\]:?$/;
    const looseHeaderRegex = /^(verse|chorus|bridge|pre-chorus|intro|outro|tag|ending|ad lib|vamp|interlude)(?:\s+\d+)?(?:\s*\(.*?\))?\s*:?$/i;

    const rawLinesAll = normalizedText.split('\n').map(s => s.trim());
    const stanzas: string[] = [];
    let currentStanzaLines: string[] = [];
    
    for (const line of rawLinesAll) {
        if (line.length === 0) continue;

        // If it looks like a tag line: [Verse] or [Verse:]
        if (genericBracketRegex.test(line) || looseHeaderRegex.test(line)) {
            if (currentStanzaLines.length > 0) {
                stanzas.push(currentStanzaLines.join('\n'));
                currentStanzaLines = [];
            }
            currentStanzaLines.push(line);
        } else {
            currentStanzaLines.push(line);
        }
    }
    if (currentStanzaLines.length > 0) {
        stanzas.push(currentStanzaLines.join('\n'));
    }

    console.dir(stanzas, {depth: null});
};

processLyricsToSlides(text);
