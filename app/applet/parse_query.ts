const vals = [
  "Gen 2",
  "Gen 2:3",
  "Gen 2:3-5",
  "Gen 2:3,5,6"
];

vals.forEach(val => {
  const match = val.match(/^(\d?\s*[a-zA-Z]+)(?:([\s:]+)(\d+))?(?:([\s:]+)([0-9,\-]+))?([:\s]*)$/);
  console.log(val, "->", match ? match.slice(1) : null);
});
