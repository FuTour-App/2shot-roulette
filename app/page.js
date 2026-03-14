"use client";
import { useState, useRef, useCallback } from "react";
import Head from "next/head";

const SPIN_DURATION = 2200;
const MULTI_THRESHOLD = 100;
const MULTI_DRAW = 3;

/* ── web-audio ── */
function useAudio() {
  const ctx = useRef(null);
  const getCtx = () => {
    if (!ctx.current) ctx.current = new (window.AudioContext || window.webkitAudioContext)();
    return ctx.current;
  };
  return useCallback((freq, dur = 0.08, vol = 0.12, type = "square") => {
    try {
      const ac = getCtx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = type; osc.frequency.setValueAtTime(freq, ac.currentTime);
      gain.gain.setValueAtTime(vol, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      osc.start(ac.currentTime); osc.stop(ac.currentTime + dur);
    } catch (_) {}
  }, []);
}

/* ── confetti ── */
function fireConfetti(count) {
  const canvas = document.getElementById("cfcanvas");
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext("2d");
  const COLORS = ["#f5c842","#e8334a","#2ecc71","#fff","#e8a800","#3498db","#e040fb"];
  const pieces = Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width, y: -10 - Math.random() * 80,
    vx: (Math.random() - 0.5) * 5, vy: 2 + Math.random() * 5,
    size: 6 + Math.random() * 9,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rot: Math.random() * 360, rotV: (Math.random() - 0.5) * 9,
    shape: Math.random() > 0.5 ? "rect" : "circle",
  }));
  let frame = 0;
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.09; p.rot += p.rotV;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, 1 - frame / 130);
      if (p.shape === "rect") ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      else { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    });
    frame++;
    if (frame < 140) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  draw();
}

/* ── pick N unique randoms (doubles as shuffle when n = pool.length) ── */
function pickN(pool, n) {
  const copy = [...pool];
  const result = [];
  const take = Math.min(n, copy.length);
  for (let i = 0; i < take; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

/*
  divideIntoGroups(numbers, g)
  Shuffles then splits into g groups, sizes between 2 and 4.
  base = floor(n/g), first `remainder` groups get +1.
*/
function divideIntoGroups(numbers, g) {
  const shuffled = pickN(numbers, numbers.length);
  const n = shuffled.length;
  const base = Math.floor(n / g);
  const remainder = n - base * g;
  const groups = [];
  let cursor = 0;
  for (let i = 0; i < g; i++) {
    const size = base + (i < remainder ? 1 : 0);
    groups.push(shuffled.slice(cursor, cursor + size));
    cursor += size;
  }
  return groups;
}

const GROUP_COLORS = [
  "#f5c842"
];

/* ════════════════════════════════════════════ */
export default function Home() {

  /* ── First Draw ── */
  const [totalNumbers, setTotalNumbers] = useState(160);
  const [selectCount,  setSelectCount]  = useState(48);
  const [drawnNumbers, setDrawnNumbers] = useState([]);
  const [drawnGroups,  setDrawnGroups]  = useState([]);
  const [spinning,     setSpinning]     = useState(false);
  const [displayNums,  setDisplayNums]  = useState(null);
  const [latestGroup,  setLatestGroup]  = useState(null);
  const [inputTotal,   setInputTotal]   = useState("160");
  const [inputSelect,  setInputSelect]  = useState("48");
  const [error,        setError]        = useState("");

  /* ── Second Draw ── */
  const [inputGroups,    setInputGroups]    = useState("12");
  const [groupError,     setGroupError]     = useState("");
  const [allGroups,      setAllGroups]      = useState(null);
  const [revealedGroups, setRevealedGroups] = useState([]);

  const play     = useAudio();
  const timerRef = useRef(null);

  const isMulti     = selectCount >= MULTI_THRESHOLD;
  const batchSize   = isMulti ? MULTI_DRAW : 1;
  const drawsLeft   = Math.max(0, selectCount - drawnNumbers.length);
  const canDraw     = drawsLeft > 0 && !spinning;
  const isDone      = drawnNumbers.length >= selectCount && selectCount > 0;
  const progressPct = selectCount > 0 ? Math.min(100, (drawnNumbers.length / selectCount) * 100) : 0;

  const secondDrawPool = Array.from({ length: selectCount }, (_, i) => i + 1);
  const maxG = Math.floor(selectCount / 2);

  const s2Done     = allGroups !== null && revealedGroups.length >= allGroups.length;
  const canReveal  = allGroups !== null && !s2Done;

  const getAvailable = useCallback(() => {
    const set = new Set(drawnNumbers);
    const pool = [];
    for (let i = 1; i <= totalNumbers; i++) if (!set.has(i)) pool.push(i);
    return pool;
  }, [totalNumbers, drawnNumbers]);

  /* ── First Draw ── */
  const handleDraw = () => {
    if (!canDraw) return;
    setSpinning(true);
    setLatestGroup(null);

    const available = getAvailable();
    const take    = Math.min(batchSize, drawsLeft, available.length);
    const winners = pickN(available, take);

    setDisplayNums(winners.map(() => available[Math.floor(Math.random() * available.length)]));

    const startTime = Date.now();
    let speed = 40;

    const tick = () => {
      const elapsed  = Date.now() - startTime;
      const progress = Math.min(elapsed / SPIN_DURATION, 1);
      const ease     = progress < 0.7 ? progress * 0.5 : 0.35 + (progress - 0.7) * (0.65 / 0.3);
      speed = 40 + ease * 280;

      const pool = getAvailable();
      setDisplayNums(winners.map(() => pool[Math.floor(Math.random() * pool.length)]));
      play(520, 0.04 + ease * 0.06, 0.08 + ease * 0.04);

      if (elapsed >= SPIN_DURATION) {
        setDisplayNums(winners);
        setDrawnNumbers((prev) => [...prev, ...winners]);
        setDrawnGroups((prev)  => [...prev, winners]);
        setLatestGroup(winners);
        setSpinning(false);
        winners.forEach((_, i) =>
          setTimeout(() => play(880 + i * 110, 0.5, 0.18, "sine"), i * 110)
        );
        fireConfetti(winners.length * 35);
        // reset second draw when first draw changes
        setAllGroups(null); setRevealedGroups([]); setGroupError("");
      } else {
        timerRef.current = setTimeout(tick, speed);
      }
    };
    timerRef.current = setTimeout(tick, speed);
  };

  const handleReset = () => {
    clearTimeout(timerRef.current);
    setDrawnNumbers([]); setDrawnGroups([]);
    setDisplayNums(null); setLatestGroup(null); setSpinning(false);
    setAllGroups(null); setRevealedGroups([]); setGroupError("");
  };


  const handleUndo = () => {
    if (spinning || drawnGroups.length === 0) return;
    const lastGroup = drawnGroups[drawnGroups.length - 1];
    setDrawnNumbers((prev) => prev.slice(0, prev.length - lastGroup.length));
    setDrawnGroups((prev)  => prev.slice(0, -1));
    setLatestGroup(null);
    setDisplayNums(null);
    setAllGroups(null); setRevealedGroups([]); setGroupError("");
  };

  const applySettings = () => {
    const t = parseInt(inputTotal), s = parseInt(inputSelect);
    if (!t || !s || t < 1 || s < 1) { setError("Enter valid positive numbers."); return; }
    if (s > t) { setError("Selected count cannot exceed total numbers."); return; }
    setError(""); setTotalNumbers(t); setSelectCount(s); handleReset();
  };

  /* ── Second Draw: "Divide" clicked ─ set up if needed, reveal one group ── */
  const handleDivide = () => {
    const g = parseInt(inputGroups);
    if (!g || g < 1)     { setGroupError("Enter a valid number of groups."); return; }
    if (g > maxG)        { setGroupError(`Max ${maxG} groups (min 2 members each).`); return; }
    if (g > selectCount) { setGroupError(`Cannot make ${g} groups from ${selectCount} numbers.`); return; }
    setGroupError("");

    // If no groups computed yet (or settings changed), compute fresh
    let groups = allGroups;
    if (!groups) {
      groups = divideIntoGroups(secondDrawPool, g);
      setAllGroups(groups);
      setRevealedGroups([]);
      // reveal first group immediately
      setRevealedGroups([groups[0]]);
      play(740, 0.3, 0.14, "sine");
      fireConfetti(30);
      return;
    }

    // Already have groups — reveal next one
    const nextIdx = revealedGroups.length;
    if (nextIdx >= groups.length) return; // all done
    setRevealedGroups((prev) => [...prev, groups[nextIdx]]);
    play(740 + nextIdx * 30, 0.3, 0.14, "sine");
    fireConfetti(25);
  };

  const drawBtnLabel = spinning
    ? "Drawing..."
    : isDone ? "Complete"
    : isMulti ? `Draw `
    : `Draw `;

  const divideBtnLabel = !allGroups
    ? "Divide"
    : s2Done
    ? "Complete"
    : `Draw `;

  return (
    <>
      <Head>
        <title>JKT48 2-Shot Roulette</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet" />
      </Head>

      

      <canvas id="cfcanvas" />

      <div className="page">

        {/* HEADER */}
        <div className="header">
          <div className="title">JKT48 2-Shot Roulettee</div>
          <div className="subtitle">by lail</div>
          {isMulti && <div className="triple-badge">Birthday 2-Shot</div>}
        </div>

        {/* SETTINGS */}
        <div className="settings-card">
          <div className="field">
            <label>Jumlah Penonton</label>
            <input type="number" min="1" inputMode="numeric"
              value={inputTotal} onChange={(e) => setInputTotal(e.target.value)} disabled={spinning} />
          </div>
          <div className="field">
            <label>Jumlah Terpilih (set ke 100 untuk BD2Shot)</label>
            <input type="number" min="1" inputMode="numeric"
              value={inputSelect} onChange={(e) => setInputSelect(e.target.value)} disabled={spinning} />
          </div>
          <button className="btn-apply" onClick={applySettings} disabled={spinning}>Apply</button>
          {error && <div className="field-error">⚠ {error}</div>}
        </div>

        {/* STATS */}
        <div className="stats">
          <div className="stat"><div className="stat-value sv-gold">{totalNumbers}</div><div className="stat-label">Jumlah penonton</div></div>
          <div className="stat"><div className="stat-value">{selectCount}</div><div className="stat-label">jumlah terpilih</div></div>
          <div className="stat"><div className="stat-value sv-green">{drawnNumbers.length}</div><div className="stat-label">terpilih</div></div>
          <div className="stat"><div className="stat-value sv-red">{drawsLeft}</div><div className="stat-label">sisa</div></div>
        </div>

        {/* DONE BANNER */}
        {isDone && (
          <div className="done-banner">
            <div className="done-title">🎉 Draw Complete!</div>
            <div className="done-sub">All {selectCount} numbers drawn</div>
          </div>
        )}

        {/* DRAWN NUMBERS */}
        {drawnNumbers.length > 0 && (
          <div className="results-section">
            <div className="results-header">
              <span className="results-title">penonton terpilih</span>
              <span className="results-count">{drawnNumbers.length}</span>
            </div>
            <div className="chips-grid">
              {[...drawnNumbers].reverse().map((n, i) => (
                <div key={n}
                  className={`chip${i < batchSize && latestGroup !== null ? " fresh" : ""}`}
                  style={{ animationDelay: i < batchSize && latestGroup !== null ? `${i * 0.08}s` : "0s" }}>
                  {n}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FIRST DRAW STAGE */}
        <div className="stage">
          {isMulti && <div className="stage-mode-label">Birthday 2-Shot</div>}
          <div className={`slot-row${isMulti ? " multi" : ""}`}>
            {Array.from({ length: batchSize }).map((_, idx) => {
              const num        = displayNums ? displayNums[idx] : null;
              const numCls     = spinning ? "spinning" : latestGroup !== null ? "winner" : num === null ? "idle" : "winner";
              const machineCls = spinning ? "active" : latestGroup !== null ? "won" : "";
              return (
                <div className="slot-col" key={idx}>
                  {batchSize > 1 && <div className="slot-col-label">Nomor {idx + 1}</div>}
                  <div className={`slot-machine ${machineCls}`}>
                    <span className={`slot-number ${numCls}`}>
                      {num !== null && num !== undefined ? num : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="controls">
            <button className="btn-draw" onClick={handleDraw} disabled={!canDraw}>{drawBtnLabel}</button>
            <button className="btn-undo" onClick={handleUndo} disabled={spinning || drawnGroups.length === 0} title="Undo last draw">↩ Undo</button>
            <button className="btn-reset" onClick={handleReset} disabled={spinning}>Reset</button>
          </div>
        </div>

        {/* PROGRESS */}
        <div className="progress-wrap">
          <div className="progress-header">
            <span className="progress-title">terpilih</span>
            <span className="progress-frac">{drawnNumbers.length} / {selectCount}</span>
          </div>
          <div className="track"><div className="fill" style={{ width: `${progressPct}%` }} /></div>
        </div>

        {/* ══ SECOND DRAW ══ */}
        <div className="divider">
          <div className="divider-line" />
          <div className="divider-label">2-Shot Member</div>
          <div className="divider-line" />
        </div>

        <div className="second-card">
          <div className="field">
            <label>jumlah member</label>
            <input type="number" min="1" max={maxG} inputMode="numeric"
              value={inputGroups}
              onChange={(e) => {
                setInputGroups(e.target.value);
                setGroupError("");
                // changing groups count resets second draw
                setAllGroups(null); setRevealedGroups([]);
              }} />
          </div>
          <button className="btn-divide" onClick={handleDivide} disabled={s2Done}>
            {divideBtnLabel}
          </button>
          <button className="s2-reset" onClick={() => { setAllGroups(null); setRevealedGroups([]); setGroupError(""); }}>
            Reset
          </button>
          {groupError && <div className="field-error">⚠ {groupError}</div>}
          <div className="second-hint">
            Divides 1–{selectCount} into groups of 2–4. Max {maxG} groups.
            {allGroups && !s2Done && ` · ${revealedGroups.length} of ${allGroups.length} drawn`}
            {s2Done && " · All groups drawn"}
          </div>
        </div>

        {/* GROUP CARDS */}
        {revealedGroups.length > 0 && (
          <div className="group-grid">
            {revealedGroups.map((group, gi) => {
              const color   = GROUP_COLORS[gi % GROUP_COLORS.length];
              const isLatest = gi === revealedGroups.length - 1;
              return (
                <div className={`group-card${isLatest ? " latest" : ""}`} key={gi}
                  style={{ borderColor: color + "55" }}>
                  <div className="group-header">
                    <span className="group-name" style={{ color }}>Group {gi + 1}</span>
                    <span className="group-size">{group.length} orang</span>
                  </div>
                  <div className="group-chips-row">
                    {group.map((n) => (
                      <span className="gchip" key={n}
                        style={{ color, borderColor: color + "66", background: color + "18" }}>
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </>
  );
}