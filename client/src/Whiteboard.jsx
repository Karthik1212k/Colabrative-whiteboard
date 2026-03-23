import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import rough from "roughjs";

const socket = io(
  window.location.hostname === "localhost" || 
  window.location.hostname === "127.0.0.1" || 
  window.location.hostname.startsWith("192.168.") || 
  window.location.hostname.startsWith("10.") 
  ? `http://${window.location.hostname}:5000` 
  : "https://colabrative-whiteboard.onrender.com"
);

const COLORS = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00", "#a5d8ff"];
const SIZES = [2, 4, 8];
const BG_COLOR = "#ffffff";

export default function Whiteboard() {
  const canvasRef = useRef(null);
  const snapshotRef = useRef(null);
  const startPosRef = useRef({ x: 0, y: 0 });

  // React State for UI
  const [currentTool, setCurrentTool] = useState('pen');
  const [currentColor, setCurrentColor] = useState(COLORS[0]);
  const [currentBackground, setCurrentBackground] = useState('transparent');
  const [currentSize, setCurrentSize] = useState(SIZES[0]);
  const [currentFillStyle, setCurrentFillStyle] = useState('hachure');
  const [currentStrokeStyle, setCurrentStrokeStyle] = useState('solid');
  const [currentSloppiness, setCurrentSloppiness] = useState(1.8);
  const [currentOpacity, setCurrentOpacity] = useState(100);
  const [currentTextAlign, setCurrentTextAlign] = useState('left');
  const [currentFontWeight, setCurrentFontWeight] = useState('normal'); 
  const [currentFontStyle, setCurrentFontStyle] = useState('normal');   
  const [activeTextPos, setActiveTextPos] = useState(null); 

  // Multiplayer State
  const [liveUsers, setLiveUsers] = useState([]);
  const [cursors, setCursors] = useState({});
  const [showGrid, setShowGrid] = useState(false);
  const [userName, setUserName] = useState(localStorage.getItem("whiteboard-user") || "");
  const [showRegModal, setShowRegModal] = useState(!localStorage.getItem("whiteboard-user"));
  const [tempName, setTempName] = useState("");
  const [showUserList, setShowUserList] = useState(false);
  const [showProperties, setShowProperties] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fileInputRef = useRef(null);
  const imgCache = useRef({});

  // Refs for canvas events so they always access the latest state without re-binding
  const toolRef = useRef(currentTool);
  const colorRef = useRef(currentColor);
  const bgColorRef = useRef(currentBackground);
  const sizeRef = useRef(currentSize);
  const fillStyleRef = useRef(currentFillStyle);
  const strokeStyleRef = useRef(currentStrokeStyle);
  const sloppinessRef = useRef(currentSloppiness);
  const opacityRef = useRef(currentOpacity);
  const textAlignRef = useRef(currentTextAlign);
  const fontWeightRef = useRef(currentFontWeight);
  const fontStyleRef = useRef(currentFontStyle);

  // Update refs when state changes
  useEffect(() => { toolRef.current = currentTool; }, [currentTool]);
  useEffect(() => { colorRef.current = currentColor; }, [currentColor]);
  useEffect(() => { bgColorRef.current = currentBackground; }, [currentBackground]);
  useEffect(() => { sizeRef.current = currentSize; }, [currentSize]);
  useEffect(() => { fillStyleRef.current = currentFillStyle; }, [currentFillStyle]);
  useEffect(() => { strokeStyleRef.current = currentStrokeStyle; }, [currentStrokeStyle]);
  useEffect(() => { sloppinessRef.current = currentSloppiness; }, [currentSloppiness]);
  useEffect(() => { opacityRef.current = currentOpacity; }, [currentOpacity]);
  useEffect(() => { textAlignRef.current = currentTextAlign; }, [currentTextAlign]);
  useEffect(() => { fontWeightRef.current = currentFontWeight; }, [currentFontWeight]);
  useEffect(() => { fontStyleRef.current = currentFontStyle; }, [currentFontStyle]);

  const drawingRef = useRef(false);
  const lastXRef = useRef(0);
  const lastYRef = useRef(0);

  // Dynamic Draw function that handles all shapes and tools
  const drawShape = (type, x0, y0, x1, y1, color, bgColor, size, isEraseStroke, fillStyle = 'hachure', strokeStyle = 'solid', sloppiness = 1.8, opacity = 100, text = "", imageData = null, textAlign = 'left', fontWeight = 'normal', fontStyle = 'normal') => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    
    ctx.globalAlpha = isEraseStroke ? 1 : (opacity / 100);

    if (type === 'image' && imageData) {
      if (imgCache.current[imageData]) {
        const img = imgCache.current[imageData];
        const oldAlpha = ctx.globalAlpha;
        ctx.globalAlpha = (opacity / 100);
        ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0);
        ctx.globalAlpha = oldAlpha;
      } else {
        const img = new Image();
        img.src = imageData;
        img.onload = () => {
           imgCache.current[imageData] = img;
           const oldAlpha = ctx.globalAlpha;
           ctx.globalAlpha = (opacity / 100);
           ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0);
           ctx.globalAlpha = oldAlpha;
        };
        img.onerror = () => {
          console.error("Failed to load image:", imageData.substring(0, 50) + "...");
        };
      }
      ctx.globalAlpha = 1;
      return;
    }

    if (type === 'text') {
      const fontSize = (size * 5) + 12;
      ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px 'Inter', sans-serif`;
      ctx.fillStyle = color;
      ctx.textAlign = textAlign;
      ctx.textBaseline = 'top';
      
      const lines = text.split('\n');
      lines.forEach((line, index) => {
        ctx.fillText(line, x0, y0 + (index * fontSize * 1.2));
      });
      
      ctx.globalAlpha = 1;
      ctx.textBaseline = 'alphabetic'; // Reset
      ctx.textAlign = 'left';           // Reset
      return;
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = size;
    ctx.strokeStyle = isEraseStroke ? BG_COLOR : color;
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";

    if (type === 'pen' || type === 'eraser' || !type) {
      if (!isEraseStroke && strokeStyle === 'dashed') ctx.setLineDash([8, 8]);
      else if (!isEraseStroke && strokeStyle === 'dotted') ctx.setLineDash([2, 4]);
      else ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      const rc = rough.canvas(canvas);
      const options = {
        stroke: isEraseStroke ? BG_COLOR : color,
        strokeWidth: size,
        fill: bgColor !== 'transparent' && !isEraseStroke ? bgColor : undefined,
        fillStyle: fillStyle,
        fillWeight: size / 2,
        roughness: sloppiness,
        bowing: 1.2,
        strokeLineDash: strokeStyle === 'dashed' ? [8, 8] : strokeStyle === 'dotted' ? [2, 4] : undefined,
        seed: Math.abs(Math.floor(x0 + y0 + x1 + y1)) || 1
      };

      if (type === 'line') rc.line(x0, y0, x1, y1, options);
      else if (type === 'rect') rc.rectangle(x0, y0, x1 - x0, y1 - y0, options);
      else if (type === 'circle') {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const d = Math.sqrt(dx * dx + dy * dy) * 2;
        rc.circle(x0, y0, d, options);
      } else if (type === 'diamond') {
        const midX = x0 + (x1 - x0) / 2;
        const midY = y0 + (y1 - y0) / 2;
        rc.polygon([[midX, y0], [x1, midY], [midX, y1], [x0, midY]], options);
      } else if (type === 'arrow') {
        rc.line(x0, y0, x1, y1, options);
        const angle = Math.atan2(y1 - y0, x1 - x0);
        const hl = 15 + size;
        const a1 = angle - Math.PI / 6;
        const a2 = angle + Math.PI / 6;
        rc.line(x1, y1, x1 - hl * Math.cos(a1), y1 - hl * Math.sin(a1), options);
        rc.line(x1, y1, x1 - hl * Math.cos(a2), y1 - hl * Math.sin(a2), options);
      }
    }
    ctx.globalAlpha = 1;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      const imgData = canvas.width > 0 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (imgData) ctx.putImageData(imgData, 0, 0);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);


    const getMousePos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
        clientX,
        clientY
      };
    };

    let lastTouchTime = 0;

    const startDrawing = (e) => {
      if (e.target !== canvas) return;
      
      if (e.type === 'touchstart') {
        lastTouchTime = Date.now();
      } else if (e.type === 'mousedown') {
        if (Date.now() - lastTouchTime < 500) return;
      }

      const textInput = document.querySelector('.canvas-text-input');
      if (textInput) {
        textInput.blur();
        return; // First tap outside just commits the active text
      }

      drawingRef.current = true;
      const pos = getMousePos(e);
      lastXRef.current = pos.x;
      lastYRef.current = pos.y;
      startPosRef.current = { x: pos.x, y: pos.y };

      const tool = toolRef.current;
      
      if (tool === 'text') {
        setActiveTextPos({ x: pos.clientX, y: pos.clientY, canvasX: pos.x, canvasY: pos.y });
        setTimeout(() => {
          const input = document.querySelector('.canvas-text-input');
          if (input) input.focus();
        }, 50);
        drawingRef.current = false;
        return;
      }

      // If we are drawing a shape, take a snapshot of the canvas so we can preview the outline cleanly
      if (tool !== 'pen' && tool !== 'eraser') {
        snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
    };

    const stopDrawing = (e) => {
      if (!drawingRef.current) return;
      drawingRef.current = false;

      const pos = getMousePos(e);
      const tool = toolRef.current;
      const color = colorRef.current;
      const bgColor = bgColorRef.current;
      const size = sizeRef.current;
      const fillStyle = fillStyleRef.current;
      const strokeStyle = strokeStyleRef.current;
      const sloppiness = sloppinessRef.current;
      const opacity = opacityRef.current;

      // Ensure the shape completes on screen release and hits the database
      if (tool !== 'pen' && tool !== 'eraser' && tool !== 'select' && tool !== 'text' && tool !== 'image') {
        socket.emit("draw", {
          type: tool,
          x0: startPosRef.current.x / canvas.width,
          y0: startPosRef.current.y / canvas.height,
          x1: pos.x / canvas.width,
          y1: pos.y / canvas.height,
          color: color,
          bgColor: bgColor,
          size: size,
          fillStyle, strokeStyle, sloppiness, opacity
        });
      }
    };

    const draw = (e) => {
      if (!drawingRef.current) return;
      e.preventDefault();

      const pos = getMousePos(e);
      const tool = toolRef.current;
      const color = colorRef.current;
      const bgColor = bgColorRef.current;
      const size = sizeRef.current;
      const fillStyle = fillStyleRef.current;
      const strokeStyle = strokeStyleRef.current;
      const sloppiness = sloppinessRef.current;
      const opacity = opacityRef.current;

      if (tool === 'select' || tool === 'image' || tool === 'text') {
        return; 
      } else if (tool === 'pen' || tool === 'eraser') {
        drawShape(tool, lastXRef.current, lastYRef.current, pos.x, pos.y, color, bgColor, size, tool === 'eraser', fillStyle, strokeStyle, sloppiness, opacity);

        // Continuous emit for pens and eraser
        socket.emit("draw", {
          type: tool,
          x0: lastXRef.current / canvas.width,
          y0: lastYRef.current / canvas.height,
          x1: pos.x / canvas.width,
          y1: pos.y / canvas.height,
          color: color,
          bgColor: bgColor,
          size: size,
          isEraser: tool === 'eraser',
          fillStyle, strokeStyle, sloppiness, opacity
        });

        lastXRef.current = pos.x;
        lastYRef.current = pos.y;
      } else {
        // We are drawing a shape interactively. Restore the clean snapshot, then draw the preview over it
        if (snapshotRef.current) {
          ctx.putImageData(snapshotRef.current, 0, 0);
        }
        drawShape(tool, startPosRef.current.x, startPosRef.current.y, pos.x, pos.y, color, bgColor, size, false, fillStyle, strokeStyle, sloppiness, opacity);
      }
    };

    // Events
    canvas.addEventListener("mousedown", startDrawing);
    window.addEventListener("mouseup", stopDrawing);
    canvas.addEventListener("mousemove", draw);

    // Track plain mouse movement for Live Cursors
    const trackCursor = (e) => {
      const pos = getMousePos(e);
      socket.emit("cursorMove", { x: pos.x / canvas.width, y: pos.y / canvas.height });
    };
    canvas.addEventListener("mousemove", trackCursor);

    canvas.addEventListener("touchstart", startDrawing, { passive: false });
    window.addEventListener("touchend", stopDrawing, { passive: false });
    canvas.addEventListener("touchmove", draw, { passive: false });

    // Socket Handlers
    socket.on("initData", (strokes) => {
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      strokes.forEach(s => {
        const isErase = s.type === 'eraser' || s.isEraser;
        drawShape(
          s.type || 'pen',
          s.x0 * canvas.width,
          s.y0 * canvas.height,
          s.x1 * canvas.width,
          s.y1 * canvas.height,
          s.color,
          s.bgColor || 'transparent',
          s.size,
          isErase,
          s.fillStyle, s.strokeStyle, s.sloppiness, s.opacity,
          s.text || "",
          s.imageData,
          s.textAlign || 'left',
          s.fontWeight || 'normal',
          s.fontStyle || 'normal'
        );
      });
    });

    socket.on("draw", (data) => {
      const isErase = data.type === 'eraser' || data.isEraser;
      drawShape(
        data.type || 'pen',
        data.x0 * canvas.width,
        data.y0 * canvas.height,
        data.x1 * canvas.width,
        data.y1 * canvas.height,
        data.color,
        data.bgColor || 'transparent',
        data.size,
        isErase,
        data.fillStyle, data.strokeStyle, data.sloppiness, data.opacity,
        data.text || "",
        data.imageData,
        data.textAlign || 'left',
        data.fontWeight || 'normal',
        data.fontStyle || 'normal'
      );
    });

    socket.on("replayData", (strokes) => {
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      let i = 0;

      function replay() {
        if (i >= strokes.length) return;
        const s = strokes[i];

        const isErase = s.type === 'eraser' || s.isEraser;
        drawShape(
          s.type || 'pen',
          s.x0 * canvas.width,
          s.y0 * canvas.height,
          s.x1 * canvas.width,
          s.y1 * canvas.height,
          s.color,
          s.bgColor || 'transparent',
          s.size,
          isErase,
          s.fillStyle, s.strokeStyle, s.sloppiness, s.opacity,
          s.text || "",
          s.imageData,
          s.textAlign || 'left',
          s.fontWeight || 'normal',
          s.fontStyle || 'normal'
        );

        i++;
        setTimeout(replay, 10);
      }
      replay();
    });

    socket.on("clearBoard", () => {
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    });

    // Handle Live Cursors
    socket.on("usersUpdate", (users) => {
      setLiveUsers(users);
    });

    socket.on("cursorMove", (user) => {
      setCursors((prev) => ({
        ...prev,
        [user.id]: user
      }));
    });

    socket.on("userLeft", (userId) => {
      setCursors((prev) => {
        const newCursors = { ...prev };
        delete newCursors[userId];
        return newCursors;
      });
    });

    // If user has a name, sync it immediately
    if (userName) {
      socket.emit("updateUser", { name: userName });
    }

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      canvas.removeEventListener("mousedown", startDrawing);
      window.removeEventListener("mouseup", stopDrawing);
      canvas.removeEventListener("mousemove", draw);
      canvas.removeEventListener("touchstart", startDrawing);
      window.removeEventListener("touchend", stopDrawing);
      canvas.removeEventListener("touchmove", draw);
      canvas.removeEventListener("mousemove", trackCursor);

      socket.off("draw");
      socket.off("initData");
      socket.off("replayData");
      socket.off("clearBoard");
      socket.off("usersUpdate");
      socket.off("cursorMove");
      socket.off("userLeft");
    };
  }, []);

  const handleUndo = () => { socket.emit("undo"); };
  const handleRedo = () => { socket.emit("redo"); };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) handleRedo();
        else handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const replay = () => { socket.emit("getReplay"); };

  const clearBoard = () => {
    socket.emit("clearBoard");
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const saveImage = () => {
    const canvas = canvasRef.current;
    const link = document.createElement("a");
    link.download = "whiteboard.png";
    link.href = canvas.toDataURL();
    link.click();
  };

  const handleRegister = (e) => {
    e.preventDefault();
    if (!tempName.trim()) return;
    setUserName(tempName);
    localStorage.setItem("whiteboard-user", tempName);
    setShowRegModal(false);
    socket.emit("updateUser", { name: tempName });
  };

  const handleTextComplete = (textValue) => {
    if (!textValue || !activeTextPos) {
      setActiveTextPos(null);
      return;
    }

    const canvas = canvasRef.current;
    const color = colorRef.current;
    const size = sizeRef.current;
    const opacity = opacityRef.current;
    const textAlign = textAlignRef.current;
    const fontWeight = fontWeightRef.current;
    const fontStyle = fontStyleRef.current;

    const action = {
      type: 'text',
      x0: activeTextPos.canvasX / canvas.width,
      y0: activeTextPos.canvasY / canvas.height,
      x1: activeTextPos.canvasX / canvas.width,
      y1: activeTextPos.canvasY / canvas.height,
      color, size, text: textValue, opacity,
      textAlign, fontWeight, fontStyle
    };
    
    socket.emit("draw", action);
    drawShape('text', activeTextPos.canvasX, activeTextPos.canvasY, activeTextPos.canvasX, activeTextPos.canvasY, color, null, size, false, null, null, null, opacity, textValue, null, textAlign, fontWeight, fontStyle);
    
    setActiveTextPos(null);
  };

  const handleImageButtonClick = () => {
    fileInputRef.current.click();
    setCurrentTool('image');
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
      alert("File is too large! Please upload an image smaller than 10MB.");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = event.target.result;
      const img = new Image();
      img.src = base64Data;
      img.onload = () => {
        const canvas = canvasRef.current;
        const x0 = (canvas.width / 2) - (img.width / 4);
        const y0 = (canvas.height / 2) - (img.height / 4);
        const x1 = x0 + (img.width / 2);
        const y1 = y0 + (img.height / 2);

        imgCache.current[base64Data] = img;
        const action = {
          type: 'image',
          x0: x0 / canvas.width,
          y0: y0 / canvas.height,
          x1: x1 / canvas.width,
          y1: y1 / canvas.height,
          imageData: base64Data,
          opacity: currentOpacity
        };
        socket.emit("draw", action);
        drawShape('image', x0, y0, x1, y1, null, null, null, false, null, null, null, currentOpacity, "", base64Data);
      };
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // Reset to allow picking the same file again
  };

  const handleLogout = () => {
    localStorage.removeItem("whiteboard-user");
    setUserName("");
    setShowRegModal(true);
    window.location.reload();
  };

  return (
    <>
      {/* Registration Modal */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/*"
        onChange={handleFileChange}
      />
      {showRegModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">Welcome to Whiteboard</h2>
            <p className="modal-subtitle">Enter your name to start collaborating</p>
            <form onSubmit={handleRegister}>
              <input
                type="text"
                className="modal-input"
                placeholder="Your Name (e.g. John Doe)"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                autoFocus
                required
              />
              <button type="submit" className="modal-submit-btn">
                Enter Whiteboard
              </button>
            </form>
          </div>
        </div>
      )}

      <div className={`whiteboard-wrapper ${showGrid ? 'grid-visible' : ''}`}>
        <canvas ref={canvasRef}></canvas>

        {activeTextPos && (
          <textarea
            autoFocus
            className="canvas-text-input"
            style={{
              position: 'fixed',
              left: activeTextPos.x,
              top: activeTextPos.y,
              color: currentColor,
              fontSize: `${(currentSize * 5) + 12}px`,
              fontWeight: currentFontWeight,
              fontStyle: currentFontStyle,
              textAlign: currentTextAlign,
              lineHeight: 1.2
            }}
            onBlur={(e) => handleTextComplete(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleTextComplete(e.target.value);
              }
              if (e.key === 'Escape') {
                setActiveTextPos(null);
              }
            }}
          />
        )}

        {Object.values(cursors).map(cursor => (
          <div
            key={cursor.id}
            className="cursor-wrapper"
            style={{
              transform: `translate(${cursor.x * window.innerWidth}px, ${cursor.y * window.innerHeight}px)`
            }}
          >
            <svg viewBox="0 0 16 16" fill={cursor.color} width="24" height="24">
              <path stroke="#ffffff" strokeWidth="2" strokeLinejoin="round" d="M3 2l10 10.6-4.6.4 3 4.2-2.2 1.4-3-4.2-3.4 3.2z"></path>
            </svg>
            <div className="cursor-nametag" style={{ backgroundColor: cursor.color }}>
              {cursor.name}
            </div>
          </div>
        ))}
      </div>

      <div className="top-left-panel">
        <div className="top-left-menu mobile-hide">
          <button className="icon-btn-square">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
        </div>

        <div className="undo-redo-panel">
          <button className="icon-btn-square" onClick={handleUndo} title="Undo (Ctrl+Z)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"></path></svg>
          </button>
          <button className="icon-btn-square" onClick={handleRedo} title="Redo (Ctrl+Y)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"></path><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"></path></svg>
          </button>
        </div>
      </div>

      <div className="toolbar center-toolbar">
        <button className="icon-btn lock-btn" title="Keep tool selected">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        </button>
        <div className="tool-divider"></div>

        <button className={`action-btn ${currentTool === 'select' ? 'active' : ''}`} onClick={() => setCurrentTool('select')} title="Selection">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path><path d="M13 13l6 6"></path></svg>
        </button>

        <button className={`action-btn ${currentTool === 'rect' ? 'active' : ''}`} onClick={() => setCurrentTool('rect')} title="Rectangle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /></svg>
        </button>

        <button className={`action-btn ${currentTool === 'diamond' ? 'active' : ''}`} onClick={() => setCurrentTool('diamond')} title="Diamond">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 22 12 12 22 2 12"></polygon></svg>
        </button>

        <button className={`action-btn ${currentTool === 'circle' ? 'active' : ''}`} onClick={() => setCurrentTool('circle')} title="Ellipse">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /></svg>
        </button>

        <button className={`action-btn ${currentTool === 'arrow' ? 'active' : ''}`} onClick={() => setCurrentTool('arrow')} title="Arrow">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </button>

        <button className={`action-btn ${currentTool === 'line' ? 'active' : ''}`} onClick={() => setCurrentTool('line')} title="Line">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="19" x2="19" y2="5" /></svg>
        </button>

        <button className={`action-btn ${currentTool === 'pen' ? 'active' : ''}`} onClick={() => setCurrentTool('pen')} title="Pen">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
        </button>

        <button className={`action-btn ${currentTool === 'text' ? 'active' : ''}`} onClick={() => setCurrentTool('text')} title="Text">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>
        </button>

        <button className={`action-btn ${currentTool === 'image' ? 'active' : ''}`} onClick={handleImageButtonClick} title="Insert image">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
        </button>

        <button className={`action-btn ${currentTool === 'eraser' ? 'active' : ''}`} onClick={() => setCurrentTool('eraser')} title="Eraser">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"></path><path d="M22 21H7"></path><path d="m5 11 9 9"></path></svg>
        </button>

        <div className="tool-divider"></div>

        <button className="icon-btn-square" onClick={saveImage} title="Save to PNG">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
        </button>
        <button className="icon-btn-square" onClick={replay} title="Replay">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"></polyline>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
          </svg>
        </button>
        <button className={`icon-btn-square ${showGrid ? 'active' : ''}`} onClick={() => setShowGrid(!showGrid)} title="Toggle Grid (G)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
        </button>
        <button
          className={`action-btn mobile-only ${showProperties ? 'active' : ''}`}
          onClick={() => setShowProperties(!showProperties)}
          title="Toggle Properties"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </button>
        <button className="icon-btn-square" onClick={clearBoard} title="Clear Board" style={{ color: '#fa5252' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
      </div>

      <div className="top-right-actions">
        {liveUsers.length > 0 && (
          <div className="live-status-wrapper">
            <div
              className={`live-status-badge ${showUserList ? 'active' : ''}`}
              onClick={() => setShowUserList(!showUserList)}
              title="Click to see active users"
            >
              <div className="live-dot"></div>
              <span>{liveUsers.length} {liveUsers.length === 1 ? 'User' : 'Users'} Live</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                style={{ marginLeft: '4px', transform: showUserList ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>

            {showUserList && (
              <div className="user-list-dropdown">
                <div className="dropdown-header">Active Users</div>
                <div className="dropdown-content">
                  {liveUsers.map((u) => (
                    <div key={u.id} className="user-list-item">
                      <div className="avatar-small" style={{ backgroundColor: u.color }}>
                        {u.initials}
                      </div>
                      <span className="user-list-name">
                        {u.name} {u.id === socket.id ? '(You)' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="avatars">
          {liveUsers.slice(0, 5).map((u) => (
            <div
              key={u.id}
              className={`avatar ${u.id === socket.id ? 'current-user' : ''}`}
              style={{ backgroundColor: u.color }}
              title={`${u.name}${u.id === socket.id ? ' (You)' : ''}`}
            >
              {u.initials}
            </div>
          ))}
          {liveUsers.length > 5 && (
            <div className="avatar more">+{liveUsers.length - 5}</div>
          )}
        </div>

        <button className="share-btn" onClick={() => {
          navigator.clipboard.writeText(window.location.href);
          alert("Room link copied to clipboard!");
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
          <span>Share</span>
        </button>
        <button className="logout-btn" onClick={handleLogout} title="Logout">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
        </button>
      </div>



      <div className="bottom-left-actions">
        <button className="icon-btn-square">-</button>
        <span className="zoom-level">63%</span>
        <button className="icon-btn-square">+</button>
      </div>

      {(showProperties || !isMobile) && (
        <div className={`properties-panel ${showProperties ? 'show-mobile' : ''}`}>
          <div className="prop-section">
            <span className="panel-title">Stroke color</span>
            <div className="hex-display">
              <div 
                className="color-swatch-wrapper"
                onClick={() => document.getElementById('stroke-color-picker').click()}
              >
                <div className="color-swatch" style={{ backgroundColor: currentColor }}></div>
                <input 
                  id="stroke-color-picker"
                  type="color" 
                  value={currentColor.startsWith('#') ? currentColor : '#000000'} 
                  onChange={(e) => setCurrentColor(e.target.value)}
                  style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                />
              </div>
              <input 
                type="text" 
                className="hex-input" 
                value={currentColor} 
                spellCheck="false"
                onChange={(e) => {
                  let val = e.target.value;
                  // Auto-prefix hex if it looks like one
                  if (/^[0-9A-F]{3,6}$/i.test(val)) {
                    val = '#' + val;
                  }
                  setCurrentColor(val);
                }}
                placeholder="#000000 or color name"
              />
            </div>
            <div className="color-grid">
              {COLORS.map(c => (
                <button
                  key={c}
                  className={`color-btn ${currentColor === c ? 'active' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setCurrentColor(c)}
                />
              ))}
            </div>
          </div>

          {(currentTool === 'rect' || currentTool === 'circle' || currentTool === 'diamond') && (
            <div className="prop-section">
              <div className="panel-title">Background</div>
              <div className="hex-display">
                <div 
                  className="color-swatch-wrapper"
                  onClick={() => currentBackground !== 'transparent' && document.getElementById('bg-color-picker').click()}
                >
                  <div className="color-swatch empty" style={currentBackground !== 'transparent' ? { backgroundColor: currentBackground } : {}}></div>
                  <input 
                    id="bg-color-picker"
                    type="color" 
                    value={currentBackground.startsWith('#') ? currentBackground : '#ffffff'} 
                    onChange={(e) => setCurrentBackground(e.target.value)}
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                  />
                </div>
                <input 
                  type="text" 
                  className="hex-input" 
                  value={currentBackground} 
                  disabled={currentBackground === 'transparent'}
                  spellCheck="false"
                  onChange={(e) => {
                    let val = e.target.value;
                    if (/^[0-9A-F]{3,6}$/i.test(val)) {
                      val = '#' + val;
                    }
                    setCurrentBackground(val);
                  }}
                  placeholder="#ffffff or color name"
                />
              </div>
              <div className="color-grid">
                <button
                  className={`color-btn custom-transparent ${currentBackground === 'transparent' ? 'active' : ''}`}
                  onClick={() => setCurrentBackground('transparent')}
                  title="Transparent"
                >
                  <div className="strike"></div>
                </button>
                {COLORS.filter((_, i) => i > 0).map(c => (
                  <button
                    key={c}
                    className={`color-btn ${currentBackground === c ? 'active' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setCurrentBackground(c)}
                  />
                ))}
              </div>
            </div>
          )}

          {currentTool === 'text' && (
            <>
              <div className="prop-section">
                <div className="panel-title">Alignment</div>
                <div className="button-group">
                  <button className={`icon-btn-radio ${currentTextAlign === 'left' ? 'active' : ''}`} onClick={() => setCurrentTextAlign('left')} title="Left">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="17" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="17" y1="18" x2="3" y2="18"></line></svg>
                  </button>
                  <button className={`icon-btn-radio ${currentTextAlign === 'center' ? 'active' : ''}`} onClick={() => setCurrentTextAlign('center')} title="Center">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="10" x2="6" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="18" y1="18" x2="6" y2="18"></line></svg>
                  </button>
                  <button className={`icon-btn-radio ${currentTextAlign === 'right' ? 'active' : ''}`} onClick={() => setCurrentTextAlign('right')} title="Right">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="10" x2="7" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="7" y2="18"></line></svg>
                  </button>
                </div>
              </div>

              <div className="prop-section">
                <div className="panel-title">Typography</div>
                <div className="button-group" style={{ width: '66%' }}>
                  <button className={`icon-btn-radio ${currentFontWeight === 'bold' ? 'active' : ''}`} onClick={() => setCurrentFontWeight(currentFontWeight === 'bold' ? 'normal' : 'bold')} title="Bold">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path></svg>
                  </button>
                  <button className={`icon-btn-radio ${currentFontStyle === 'italic' ? 'active' : ''}`} onClick={() => setCurrentFontStyle(currentFontStyle === 'italic' ? 'normal' : 'italic')} title="Italic">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="4" x2="10" y2="4"></line><line x1="14" y1="20" x2="5" y2="20"></line><line x1="15" y1="4" x2="9" y2="20"></line></svg>
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="prop-section">
            <div className="panel-title">Fill</div>
            <div className="button-group">
              <button className={`icon-btn-radio ${currentFillStyle === 'hachure' ? 'active' : ''}`} onClick={() => setCurrentFillStyle('hachure')}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 3l18 18M3 9l18 18M3 15l18 18M9 3l18 18M15 3l18 18" /></svg></button>
              <button className={`icon-btn-radio ${currentFillStyle === 'cross-hatch' ? 'active' : ''}`} onClick={() => setCurrentFillStyle('cross-hatch')}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="12" cy="12" r="3" fill="currentColor" /></svg></button>
              <button className={`icon-btn-radio ${currentFillStyle === 'solid' ? 'active' : ''}`} onClick={() => setCurrentFillStyle('solid')}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="3" y="3" width="18" height="18" rx="2"></rect></svg></button>
            </div>
          </div>

          <div className="prop-section">
            <div className="panel-title">Stroke width</div>
            <div className="button-group">
              {SIZES.map((s, idx) => (
                <button
                  key={s}
                  className={`icon-btn-radio ${currentSize === s ? 'active' : ''}`}
                  onClick={() => setCurrentSize(s)}
                >
                  <div style={{ width: '12px', height: `${1 + idx * 2}px`, background: 'currentColor', borderRadius: '1px' }}></div>
                </button>
              ))}
            </div>
          </div>

          <div className="prop-section">
            <div className="panel-title">Stroke style</div>
            <div className="button-group">
              <button className={`icon-btn-radio ${currentStrokeStyle === 'solid' ? 'active' : ''}`} onClick={() => setCurrentStrokeStyle('solid')}><div style={{ width: '12px', height: '2px', background: 'currentColor' }} /></button>
              <button className={`icon-btn-radio ${currentStrokeStyle === 'dashed' ? 'active' : ''}`} onClick={() => setCurrentStrokeStyle('dashed')}><div style={{ width: '12px', height: '2px', borderTop: '2px dashed currentColor' }} /></button>
              <button className={`icon-btn-radio ${currentStrokeStyle === 'dotted' ? 'active' : ''}`} onClick={() => setCurrentStrokeStyle('dotted')}><div style={{ width: '12px', height: '2px', borderTop: '2px dotted currentColor' }} /></button>
            </div>
          </div>

          <div className="prop-section">
            <div className="panel-title">Sloppiness</div>
            <div className="button-group">
              <button className={`icon-btn-radio ${currentSloppiness === 0 ? 'active' : ''}`} onClick={() => setCurrentSloppiness(0)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18" /></svg></button>
              <button className={`icon-btn-radio ${currentSloppiness === 1.8 ? 'active' : ''}`} onClick={() => setCurrentSloppiness(1.8)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 14c4-4 6-4 10 0s6 4 10 0" /></svg></button>
              <button className={`icon-btn-radio ${currentSloppiness === 3 ? 'active' : ''}`} onClick={() => setCurrentSloppiness(3)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 16c2-8 3-8 6 0 2 6 3 6 6 0 2-4 3-4 6 0" /></svg></button>
            </div>
          </div>

          <div className="prop-section">
            <div className="panel-title">Edges</div>
            <div className="button-group" style={{ width: '66%' }}>
              <button className="icon-btn-radio active"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" /></svg></button>
              <button className="icon-btn-radio"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="4" /></svg></button>
            </div>
          </div>

          <div className="prop-section">
            <div className="panel-title">Opacity</div>
            <input type="range" min="10" max="100" value={currentOpacity} onChange={(e) => setCurrentOpacity(Number(e.target.value))} className="opacity-slider" />
          </div>

          <div className="prop-section border-top">
            <div className="panel-title">Layers</div>
            <div className="button-group">
            </div>
          </div>
        </div>
      )}
    </>
  );
}
