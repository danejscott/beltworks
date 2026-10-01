declare const __BUILD__: number;
declare module '*?worker&inline' { const W: { new(): Worker }; export default W; }
