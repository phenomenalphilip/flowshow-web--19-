const firstLine = "[Chorus:]";
let cleanHeader = firstLine.replace(/^\[|\]:?$/g, '').replace(/:$/, '').trim();
cleanHeader = cleanHeader.replace(/\(.*?\)/g, '').trim();
console.log("clean 1", cleanHeader);
const match = cleanHeader.match(/^(verse|chorus|bridge|pre-chorus|intro|outro|tag|ending|ad lib|vamp|interlude)(?:\s+\d+)?/i);
console.log("match", match ? match[0] : null);
