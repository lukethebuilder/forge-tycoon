// FILE: src/App.tsx

import { useState, useEffect, useRef } from 'react';
import type { GameState, Order, Grade } from './game/types';
import {
  initState,
  tick,
  selectOrder,
  startCraft,
  hammer,
  bellows,
  quench,
  buyUpgrade,
  clearFeaturedRun,
} from './game/engine';
import {
  TONGS_UPGRADE_ID,
  TONGS_GOOD_WIDEN_PER_LEVEL,
  TONGS_PERFECT_WIDEN_MAX,
  BELLOWS_UPGRADE_ID,
  BELLOWS_HEAT_BASE,
  BELLOWS_HEAT_PER_LEVEL,
  BELLOWS_COOLDOWN_MS,
  POLISH_UPGRADE_ID,
  POLISH_REP_BONUS_PER_LEVEL,
  APPRENTICE_UPGRADE_ID,
  HEAT_DRIFT_APPRENTICE_PER_LEVEL,
  OILSTONE_UPGRADE_ID,
  OILSTONE_DEFECT_REDUCTION_PER_LEVEL,
  FRONT_SIGN_UPGRADE_ID,
  HEAT_START,
  HEAT_DRIFT_PER_TICK,
  HEAT_PERFECT_LO,
  HEAT_PERFECT_HI,
  HEAT_GOOD_LO,
  HEAT_GOOD_HI,
  HEAT_TOO_HOT_HI,
  HAMMER_COOLDOWN_MS,
  GRADE_PAYOUT_MULT,
  GRADE_REP_MULT,
  TIER_MULTIPLIERS,
  UPGRADE_BASE_COSTS,
  upgradeCost,
  RANKS,
  EVENTS,
  ITEM_FLAVOR_LINES,
  UPGRADE_UNLOCK_RANK,
} from './game/balance';
import { loadState, saveState } from './lib/storage';
import { FeaturedRunCanvas } from './ui/FeaturedRunCanvas';
import './App.css';

// ─── Tier display ─────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  ROOKIE:  '#888',
  REGULAR: '#38bdf8',
  NOBLE:   '#fbbf24',
};

// ─── FX state ─────────────────────────────────────────────────────────────────

type FxEvent =
  | { kind: 'CLANG'; id: number }
  | { kind: 'SPARKS'; id: number; sparks: { angle: number; dist: number }[] }
  | { kind: 'GOLD'; id: number; amount: number }
  | { kind: 'FAIL'; id: number };

// ─── Stable string hash ───────────────────────────────────────────────────────

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

// ─── Upgrade effect text ──────────────────────────────────────────────────────

function upgradeEffectText(id: string, level: number): string {
  if (id === TONGS_UPGRADE_ID)
    return level === 0 ? 'Widens sweet spot' : `Sweet spot +${level * TONGS_GOOD_WIDEN_PER_LEVEL * 2} wider`;
  if (id === BELLOWS_UPGRADE_ID)
    return `Bellows: +${BELLOWS_HEAT_BASE + level * BELLOWS_HEAT_PER_LEVEL} heat`;
  if (id === POLISH_UPGRADE_ID)
    return `+${level * POLISH_REP_BONUS_PER_LEVEL} rep/delivery`;
  if (id === APPRENTICE_UPGRADE_ID)
    return level === 0 ? 'Slows heat drift' : `\u22122.4 heat/sec drift`;
  if (id === OILSTONE_UPGRADE_ID)
    return level === 0 ? 'Reduces bad-strike defects' : `\u22121 defect/bad strike`;
  if (id === FRONT_SIGN_UPGRADE_ID)
    return `+${level} weight toward higher-tier customers`;
  return '';
}

// ─── App ─────────────────────────────────────────────────────────────────────

function App() {
  const [state, setState] = useState<GameState>(() => loadState() ?? initState());
  const [fx, setFx] = useState<FxEvent | null>(null);
  const fxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lockToast, setLockToast] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState<boolean>(
    () => localStorage.getItem('cf_seen_intro') !== '1'
  );
  const [tutorialStep, setTutorialStep] = useState<number>(
    () => localStorage.getItem('cf_seen_tutorial') === '1' ? -1 : 0
  );

  useEffect(() => {
    const id = setInterval(() => {
      setState(prev => {
        const next = tick(prev, 250);
        saveState(next);
        return next;
      });
    }, 250);
    return () => clearInterval(id);
  }, []);

  // ─── Derived values ────────────────────────────────────────────────────────

  const isCrafting = state.crafting !== undefined;
  const heat = state.crafting?.heat ?? 0;
  const quality = state.crafting?.quality ?? 0;
  const defects = state.crafting?.defects ?? 0;
  const strikesRemaining = state.crafting?.strikesRemaining ?? 0;
  const hammerCd = state.crafting?.hammerCooldownMs ?? 0;
  const bellowsCd = state.crafting?.bellowsCooldownMs ?? 0;
  const autoQuenchMs = state.crafting?.autoQuenchMs ?? 0;

  const score = quality - defects * 1.5;
  const liveGrade: Grade = score >= 60 ? 'S' : score >= 45 ? 'A' : score >= 30 ? 'B' : score >= 15 ? 'C' : 'F';
  const hammerReady = isCrafting && hammerCd === 0;
  const bellowsReady = isCrafting && bellowsCd === 0;

  const currentRank = RANKS[state.rankIndex];
  const nextRank = RANKS[state.rankIndex + 1];

  const eventDef = state.event ? EVENTS.find(e => e.id === state.event!.id) : undefined;

  // ─── Tutorial auto-advance ─────────────────────────────────────────────────

  useEffect(() => {
    if (tutorialStep === 0 && state.activeOrderId) setTutorialStep(1);
    if (tutorialStep === 1 && isCrafting) setTutorialStep(2);
    if (tutorialStep === 2 && state.ordersCompleted >= 1) setTutorialStep(3);
  }, [state.activeOrderId, isCrafting, state.ordersCompleted, tutorialStep]);

  // ─── FX trigger ────────────────────────────────────────────────────────────

  function triggerFx(event: FxEvent, durationMs: number) {
    if (fxTimerRef.current) clearTimeout(fxTimerRef.current);
    setFx(event);
    fxTimerRef.current = setTimeout(() => setFx(null), durationMs);
  }

  function getNextObjective(): string {
    if (state.ordersCompleted === 0) return 'Complete your first order';
    const hasAnyUpgrade = state.upgrades.some(u => u.level > 0);
    if (!hasAnyUpgrade) {
      return state.gold >= 80
        ? 'Buy Tongs (80g) — your first upgrade'
        : `Earn ${80 - state.gold}g more → Buy Tongs`;
    }
    if (!nextRank) return 'Max rank achieved!';
    return `${nextRank.xpRequired - state.repXp} rep → ${nextRank.name}`;
  }

  function previewTime(_order: Order): string {
    return 'Interactive';
  }

  function previewPayout(order: Order): string {
    const tierMult = TIER_MULTIPLIERS[order.customerTier].payoutMult;
    const eventPayoutMult = eventDef?.payoutMult ?? 1;
    return Math.round(order.basePayout * tierMult * eventPayoutMult) + 'g (×grade)';
  }

  // ─── Tutorial helpers ──────────────────────────────────────────────────────

  const TUTORIAL_MESSAGES: Record<number, string> = {
    0: 'Pick an order to craft.',
    1: 'Manage heat with Bellows, strike at the right zones, then Quench.',
    2: 'Your strikes and heat timing determine quality. Better heat = better grades!',
    3: 'Buy your first upgrade to improve the forge.',
  };

  function dismissTutorial() {
    localStorage.setItem('cf_seen_tutorial', '1');
    setTutorialStep(-1);
  }

  // ─── Event handlers ────────────────────────────────────────────────────────

  function handleSelectOrder(orderId: string) {
    setState(prev => selectOrder(prev, orderId));
  }

  function handleStartCraft() {
    setState(prev => startCraft(prev));
    triggerFx({ kind: 'CLANG', id: Date.now() }, 800);
  }

  function handleHammer() {
    setState(prev => hammer(prev));
    triggerFx({
      kind: 'SPARKS',
      id: Date.now(),
      sparks: Array.from({ length: 8 }, (_, i) => ({
        angle: (Math.PI * 2 * i) / 8 + Math.random() * 0.4,
        dist: 25 + Math.random() * 35,
      })),
    }, 650);
  }

  function handleBellows() {
    setState(prev => bellows(prev));
  }

  function handleQuench() {
    setState(prev => {
      const next = quench(prev);
      saveState(next);
      const ev = next.lastEvent;
      if (ev) {
        if (ev.grade === 'S' || ev.grade === 'A' || ev.grade === 'B') {
          triggerFx({ kind: 'GOLD', id: Date.now(), amount: ev.goldGained }, 1300);
        } else if (ev.grade === 'C' || ev.grade === 'F') {
          triggerFx({ kind: 'FAIL', id: Date.now() }, 600);
        }
      }
      return next;
    });
  }

  function handleBuyUpgrade(upgradeId: string) {
    setState(prev => {
      const next = buyUpgrade(prev, upgradeId);
      saveState(next);
      return next;
    });
    if (tutorialStep === 3) {
      dismissTutorial();
    }
  }

  function handleCloseRun() {
    setState(prev => {
      const next = clearFeaturedRun(prev);
      saveState(next);
      return next;
    });
  }

  function handleRestartGame() {
    if (window.confirm('Restart the game? This will clear all progress.')) {
      localStorage.removeItem('cf_seen_intro');
      localStorage.removeItem('cf_seen_tutorial');
      localStorage.removeItem('forge-tycoon-state');
      setState(initState());
      setShowIntro(true);
      setTutorialStep(0);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const forgeColClass = `forge-col${fx?.kind === 'CLANG' ? ' forge-shake' : ''}`;

  return (
    <div style={{ minHeight: '100vh', boxSizing: 'border-box' }}>
      {/* Lock toast */}
      {lockToast && (
        <div className="lock-toast">{lockToast}</div>
      )}

      {/* Intro modal */}
      {showIntro && (
        <div className="intro-overlay">
          <div className="intro-card">
            <h1>Crawlside Forge</h1>
            <p>The dungeon chews up heroes.</p>
            <p>You keep them standing.</p>
            <p style={{ marginTop: '4px' }}>Craft weapons, earn gold, build your reputation.</p>
            <p className="goal">Goal: Reach Journeyman and earn entry into the Guild.</p>
            <button
              className="intro-start-btn"
              onClick={() => {
                localStorage.setItem('cf_seen_intro', '1');
                setShowIntro(false);
              }}
            >
              Start Day 1
            </button>
          </div>
        </div>
      )}

      {/* Vignette overlay */}
      <div className="vignette" />

      {/* Canvas overlay — featured run animation */}
      {state.featuredRun && state.rankIndex >= 2 && (
        <FeaturedRunCanvas run={state.featuredRun} onClose={handleCloseRun} />
      )}

      {/* Title bar */}
      <div className="title-bar">
        <span className="game-title">Crawlside Forge</span>
        <span className="rank-badge">⚔ {currentRank.name}</span>
        <button
          onClick={handleRestartGame}
          style={{
            marginLeft: 'auto',
            padding: '4px 8px',
            fontSize: '0.8rem',
            background: 'transparent',
            border: '1px solid #666',
            color: '#999',
            borderRadius: '4px',
            cursor: 'pointer',
            opacity: 0.7,
          }}
          title="For testing only"
        >
          🔄 Restart (Testing)
        </button>
      </div>

      {/* HUD */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid #2a2a2a',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        flexWrap: 'wrap',
        fontSize: '0.95rem',
      }}>
        <span style={{ color: '#fbbf24', fontWeight: 'bold', fontSize: '1.1rem' }}>
          {state.gold}g
        </span>
        {nextRank ? (
          <span style={{ fontSize: '0.85rem', color: '#aaa' }}>
            {state.repXp} / {nextRank.xpRequired} rep
            <span style={{ color: '#555' }}> → {nextRank.name}</span>
          </span>
        ) : (
          <span style={{ fontSize: '0.85rem', color: '#fbbf24' }}>
            {state.repXp} rep — Max rank!
          </span>
        )}
        {state.rankIndex >= 1 && eventDef && (
          <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 'normal' }}>
            ⚡ {eventDef.name} ({state.event!.remainingDeliveries} left)
          </span>
        )}
        <span className="hud-objective">🎯 {getNextObjective()}</span>
      </div>

      {/* 3-column layout */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: '12px',
        padding: '0 16px 16px',
        minHeight: 'calc(100vh - 120px)',
        boxSizing: 'border-box',
      }}>
        {/* Column 1 — Orders */}
        <div className={tutorialStep === 0 ? 'tutorial-highlight' : ''}
          style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          border: '1px solid #2a2a2a',
          borderRadius: '12px',
          padding: '12px',
        }}>
          {tutorialStep === 0 && (
            <div className="tutorial-chip">
              <span>{TUTORIAL_MESSAGES[0]}</span>
              <button onClick={dismissTutorial}>✕</button>
            </div>
          )}
          <div className="section-heading">Orders</div>
          {state.orders.map(order => {
            const isSelected = order.id === state.activeOrderId;
            const flavorLines = ITEM_FLAVOR_LINES[order.itemType] ?? [];
            const flavor = flavorLines.length > 0
              ? flavorLines[hashId(order.id) % flavorLines.length]
              : null;
            return (
              <button
                key={order.id}
                onClick={() => handleSelectOrder(order.id)}
                style={{
                  border: isSelected
                    ? '2px solid #646cff'
                    : order.isFeatured
                      ? '1px solid #a855f7'
                      : '1px solid #333',
                  borderRadius: '8px',
                  padding: '10px',
                  textAlign: 'left',
                  cursor: isCrafting ? 'not-allowed' : 'pointer',
                  opacity: isCrafting ? 0.6 : 1,
                  background: isSelected ? '#1e1e3f' : order.isFeatured ? '#1a0f2e' : '#111',
                  lineHeight: '1.6',
                }}
              >
                <div style={{ fontWeight: 'bold' }}>
                  {order.isFeatured && state.rankIndex >= 2 ? '⭐ ' : ''}{order.itemType}
                </div>
                <div style={{ fontSize: '0.75rem', color: TIER_COLORS[order.customerTier], marginBottom: '2px' }}>
                  {order.customerTier}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#aaa' }}>
                  ⏱ {previewTime(order)} &nbsp; 💰 {previewPayout(order)}
                </div>
                {flavor && (
                  <div style={{ fontSize: '0.72rem', color: '#555', fontStyle: 'italic', marginTop: '3px' }}>
                    {flavor}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Column 2 — Forge */}
        <div className={`${forgeColClass}${tutorialStep === 1 || tutorialStep === 2 ? ' tutorial-highlight' : ''}`} style={{
          flex: 1.5,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          border: '1px solid #444',
          borderRadius: '12px',
          padding: '12px',
        }}>
          {(tutorialStep === 1 || tutorialStep === 2) && (
            <div className="tutorial-chip">
              <span>{TUTORIAL_MESSAGES[tutorialStep]}</span>
              <button onClick={dismissTutorial}>✕</button>
            </div>
          )}
          <div className="section-heading">Forge</div>

          {/* Next goal */}
          {nextRank && (
            <div className="next-goal">
              🎯 {nextRank.xpRequired - state.repXp} rep → {nextRank.name}
            </div>
          )}


          {!isCrafting && (
            <button
              onClick={handleStartCraft}
              disabled={!state.activeOrderId}
              style={{
                marginTop: '4px',
                fontSize: '1.05rem',
                fontWeight: 'bold',
                padding: '0.7em 1.2em',
              }}
            >
              Start Craft
            </button>
          )}

          {isCrafting && (
            <>
              {/* Heat meter */}
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '4px' }}>
                  Heat: {Math.round(heat)}°
                </div>
                <div style={{
                  background: '#222',
                  borderRadius: '6px',
                  height: '28px',
                  overflow: 'hidden',
                  position: 'relative',
                }}>
                  <div style={{
                    width: `${(heat / 100) * 100}%`,
                    height: '100%',
                    background: heat < 35 ? '#60a5fa' : heat < 70 ? '#f59e0b' : '#ef4444',
                    transition: 'width 0.1s linear',
                  }} />
                  {/* Heat zone tick marks */}
                  {[35, 50, 62, 70, 85].map(heatVal => (
                    <div key={heatVal} style={{
                      position: 'absolute',
                      left: `${heatVal}%`,
                      top: 0,
                      bottom: 0,
                      width: '1px',
                      background: heatVal === 62 ? '#22c55e' : '#555',
                      opacity: 0.6,
                    }} />
                  ))}
                  {/* GOOD zone overlay (50–70) */}
                  <div style={{
                    position: 'absolute',
                    left: '50%',
                    top: 0,
                    bottom: 0,
                    width: '20%',
                    background: 'rgba(34,197,94,0.1)',
                    border: '1px dashed #22c55e',
                  }} />
                </div>
              </div>

              {/* Advisory text */}
              <div style={{ fontSize: '0.75rem', color: '#aaa', textAlign: 'center', marginTop: '4px', fontStyle: 'italic' }}>
                {strikesRemaining > 0
                  ? heat >= 50 && heat <= 75
                    ? 'Strike now! (ideal quench zone)'
                    : heat < 50
                      ? 'Heat up with Bellows'
                      : 'Cool down before quenching'
                  : `Quench now! (auto in ${Math.max(0, Math.round(autoQuenchMs / 1000))}s)`}
              </div>

              {/* Strike summary */}
              <div style={{ fontSize: '0.8rem', color: '#aaa', textAlign: 'center', marginTop: '6px' }}>
                Quality: <span style={{ color: '#22c55e' }}>{quality}</span> | Defects: <span style={{ color: '#ef4444' }}>{defects}</span> | Score: <span style={{ color: '#fbbf24' }}>{Math.round(score)} → {liveGrade}</span>
              </div>

              {/* Strikes remaining */}
              <div style={{ fontSize: '0.8rem', color: '#aaa', textAlign: 'center', marginTop: '4px' }}>
                Strikes: {strikesRemaining} remaining
              </div>

              {/* Hammer and Bellows buttons */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <button
                    onClick={handleHammer}
                    disabled={!hammerReady || strikesRemaining <= 0}
                    style={{
                      width: '100%',
                      opacity: hammerReady && strikesRemaining > 0 ? 1 : 0.6,
                    }}
                  >
                    🔨 Hammer
                    {hammerCd > 0 ? ` (${(hammerCd / 1000).toFixed(1)}s)` : ''}
                  </button>
                  {fx?.kind === 'SPARKS' && (
                    <div className="sparks-container">
                      {fx.sparks.map((s, i) => (
                        <div
                          key={i}
                          className="spark"
                          style={{
                            '--tx': `${Math.cos(s.angle) * s.dist}px`,
                            '--ty': `${Math.sin(s.angle) * s.dist}px`,
                          } as React.CSSProperties}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleBellows}
                  disabled={!bellowsReady}
                  style={{
                    flex: 1,
                    opacity: bellowsReady ? 1 : 0.6,
                  }}
                >
                  💨 Bellows
                  {bellowsCd > 0 ? ` (${(bellowsCd / 1000).toFixed(1)}s)` : ''}
                </button>
              </div>

              {/* Quench button */}
              <button
                onClick={handleQuench}
                style={{
                  marginTop: '8px',
                  width: '100%',
                  background:
                    heat > 75
                      ? '#ef4444'
                      : heat >= 50 && heat <= 75
                        ? '#22c55e'
                        : heat >= 35
                          ? '#60a5fa'
                          : '#7c3aed',
                  color: heat > 75 || (heat >= 50 && heat <= 75) ? '#fff' : '#111',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                }}
              >
                🧊 Quench
                {strikesRemaining <= 0 ? ` (auto in ${Math.max(0, Math.round(autoQuenchMs / 1000))}s)` : ''}
              </button>

              {/* Strike feedback */}
              {state.crafting?.lastStrike && state.crafting.lastStrike.ageMs < 1200 && (
                <div
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    marginTop: '4px',
                    color: state.crafting.lastStrike.zone === 'PERFECT' ? '#22c55e' : state.crafting.lastStrike.zone === 'GOOD' ? '#fbbf24' : '#ef4444',
                    opacity: 1 - state.crafting.lastStrike.ageMs / 1200,
                  }}
                >
                  {state.crafting.lastStrike.zone === 'PERFECT'
                    ? `PERFECT! +${state.crafting.lastStrike.qualityDelta}`
                    : state.crafting.lastStrike.zone === 'GOOD'
                      ? `GOOD +${state.crafting.lastStrike.qualityDelta}`
                      : `BAD +${state.crafting.lastStrike.qualityDelta} / +${state.crafting.lastStrike.defectDelta} defects`}
                </div>
              )}
            </>
          )}

          {/* Grade result */}
          {state.lastEvent && (
            <div style={{
              fontSize: '0.9rem',
              fontWeight: 'bold',
              color: state.lastEvent.grade === 'S' || state.lastEvent.grade === 'A' || state.lastEvent.grade === 'B' ? '#22c55e' : state.lastEvent.grade === 'C' ? '#fbbf24' : '#ef4444',
              textAlign: 'center',
              marginTop: '8px',
            }}>
              Grade: {state.lastEvent.grade} | +{state.lastEvent.goldGained}g · +{state.lastEvent.repGained} rep
            </div>
          )}

          {/* FX overlays */}
          {fx?.kind === 'CLANG' && (
            <div className="clang-pop" key={fx.id}>CLANG!</div>
          )}
          {fx?.kind === 'GOLD' && (
            <div className="gold-float" key={fx.id}>+{fx.amount}g</div>
          )}
          {fx?.kind === 'FAIL' && (
            <div className="fail-flash" key={fx.id} />
          )}
        </div>

        {/* Column 3 — Upgrades */}
        <div className={tutorialStep === 3 ? 'tutorial-highlight' : ''}
          onClick={() => tutorialStep === 3 && dismissTutorial()}
          style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          border: '1px solid #2a2a2a',
          borderRadius: '12px',
          padding: '12px',
        }}>
          {tutorialStep === 3 && (
            <div className="tutorial-chip">
              <span>{TUTORIAL_MESSAGES[3]}</span>
              <button onClick={(e) => { e.stopPropagation(); dismissTutorial(); }}>✕</button>
            </div>
          )}
          <div className="section-heading">Upgrades</div>
          {state.upgrades.map(upgrade => {
            const baseCost = UPGRADE_BASE_COSTS[upgrade.id] ?? 0;
            const cost = upgradeCost(baseCost, upgrade.level);
            const isMaxed = upgrade.level >= upgrade.maxLevel;
            const canAfford = state.gold >= cost;
            const unlockRank = UPGRADE_UNLOCK_RANK[upgrade.id] ?? 0;
            const isLocked = state.rankIndex < unlockRank;
            return (
              <div
                key={upgrade.id}
                className={isLocked ? 'upgrade-locked-card' : ''}
                style={{
                  border: '1px solid #2a2a2a',
                  borderRadius: '10px',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  background: '#0d0d0d',
                }}
              >
                <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{upgrade.name}</div>
                <div style={{ fontSize: '0.8rem', color: '#666' }}>
                  Level {upgrade.level} / {upgrade.maxLevel}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#888' }}>
                  {upgradeEffectText(upgrade.id, upgrade.level)}
                </div>
                {!isMaxed && (
                  <div style={{ fontSize: '0.8rem', color: '#aaa' }}>Next: {cost}g</div>
                )}
                {isLocked && (
                  <div className="upgrade-unlock-hint">
                    🔒 Reach {RANKS[unlockRank].name}
                  </div>
                )}
                <button
                  onClick={() => {
                    if (isLocked) {
                      setLockToast(`Unlocks at ${RANKS[unlockRank].name}`);
                      setTimeout(() => setLockToast(null), 2000);
                      return;
                    }
                    handleBuyUpgrade(upgrade.id);
                  }}
                  disabled={isMaxed || !canAfford || isLocked}
                  style={
                    isLocked
                      ? { color: '#666', cursor: 'not-allowed' }
                      : isMaxed
                        ? { color: '#22c55e', fontWeight: 'bold' }
                        : canAfford
                          ? { background: '#7c3aed', color: '#fff' }
                          : undefined
                  }
                >
                  {isLocked ? `Locked (${RANKS[unlockRank].name})` : isMaxed ? 'MAX' : `Buy (${cost}g)`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default App;
