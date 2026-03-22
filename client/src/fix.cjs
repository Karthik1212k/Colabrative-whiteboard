const fs = require('fs');
const filepath = 'c:/Disk d/Projects/Colabrative-whiteboard/client/src/Whiteboard.jsx';
let code = fs.readFileSync(filepath, 'utf8');

const startStr = "    const drawShape = ";
const startIdx = code.indexOf(startStr);
const endStr = "      ctx.globalAlpha = 1; // Always restore for future layers\n    };\n";
const endIdx = code.indexOf(endStr, startIdx) + endStr.length;

let drawShapeFn = code.substring(startIdx, endIdx);

// Remove it from the original place
code = code.slice(0, startIdx) + code.slice(endIdx);

// Modify it to have `const canvas = canvasRef.current` internally
drawShapeFn = drawShapeFn.replace(
  'const ctx = canvas.getContext("2d");',
  'const canvas = canvasRef.current;\n    if (!canvas) return;\n    const ctx = canvas.getContext("2d");'
);

// We should also adjust indentation if necessary, but it's fine.
// Let's insert it right above `useEffect(() => {`
const insertStr = "  useEffect(() => {\n    const canvas = canvasRef.current;";
const insertIdx = code.indexOf(insertStr);

code = code.slice(0, insertIdx) + drawShapeFn + '\n' + code.slice(insertIdx);

fs.writeFileSync(filepath, code);
console.log("Fixed!");
