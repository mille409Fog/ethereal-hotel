// `angular.json` loads `.txt` imports as their contents (`"loader": { ".txt": "text" }`),
// so `/writing` can render a plain text file kept beside it.
declare module '*.txt' {
  const content: string;
  export default content;
}
