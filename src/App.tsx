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
  BELLOWS_UPGRADE_ID,
  BELLOWS_HEAT_BASE,
  BELLOWS_HEAT_PER_LEVEL,
  POLISH_UPGRADE_ID,
  POLISH_REP_BONUS_PER_LEVEL,
  APPRENTICE_UPGRADE_ID,
  OILSTONE_UPGRADE_ID,
  FRONT_SIGN_UPGRADE_ID,
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

// --- Tier display ---

const TIER_COLORS: Record<string, string> = {
  ROOKIE: '#888',
  REGULAR: '#38bdf8',
  NOBLE: '#fbbf24',
};

// --- FX state ---

type FxEvent =
  | { kind: 'CLANG'; id: number }
  | { kind: 'SPARKS'; id: number; sparks: { angle: number; dist: number }[] }
  | { kind: 'GOLD'; id: number; amount: number }
  | { kind: 'FAIL'; id: number };

// --- Stable string hash ---

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

// --- Upgrade effect text ---

function upgradeEffectText(id: string, level: number): string {
  if (id === TONGS_UPGRADE_ID)
    return level === 0 ? 'Widens sweet spot' : `Sweet spot +${level * TONGS_GOOD_WIDEN_PER_LEVEL * 2} wider`;
  if (id === BELLOWS_UPGRADE_ID)
    return `Bellows: +${BELLOWS_HEAT_BASE + level * BELLOWS_HEAT_PER_LEVEL} heat`;
  if (id === POLISH_UPGRADE_ID)
    return `+${level * POLISH_REP_BONUS_PER_LEVEL} rep/delivery`;
  if (id === APPRENTICE_UPGRADE_ID)
    return level === 0 ? 'Slows heat drift' : `-2.4 heat/sec drift`;
  if (id === OILSTONE_UPGRADE_ID)
    return level === 0 ? 'Reduces bad-strike defects' : `-1 defect/bad strike`;
  if (id === FRONT_SIGN_UPGRADE_ID)
    return `+${level} weight toward higher-tier customers`;
  return '';
}

// --- App ---

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
  const [openDrawer, setOpenDrawer] = useState<'orders' | 'upgrades' | null>(null);

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

  // --- ESC key to close drawer ---

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenDrawer(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // --- Derived values ---

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

  const selectedOrder = state.orders.find(o => o.id === state.activeOrderId);

  // --- Tutorial auto-advance ---

  useEffect(() => {
    if (tutorialStep === 0 && state.activeOrderId) setTutorialStep(1);
    if (tutorialStep === 1 && isCrafting) setTutorialStep(2);
    if (tutorialStep === 2 && state.ordersCompleted >= 1) setTutorialStep(3);
  }, [state.activeOrderId, isCrafting, state.ordersCompleted, tutorialStep]);

  // --- FX trigger ---

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

  // --- Tutorial helpers ---

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

  // --- Event handlers ---

  function handleSelectOrder(orderId: string) {
    setState(prev => selectOrder(prev, orderId));
    setOpenDrawer(null);
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

  // --- Render ---

  const heatColor = heat < 35 ? '#60a5fa' : heat < 70 ? '#f59e0b' : '#ef4444';
  const quenchColor =
    heat > 75 ? 'quench-hot' : heat >= 50 && heat <= 75 ? 'quench-ideal' : heat >= 35 ? 'quench-cold' : 'quench-neutral';

  return (
    <div className="app-shell">
      {/* Lock toast */}
      {lockToast && <div className="lock-toast">{lockToast}</div>}

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

      {/* Canvas overlay - featured run animation */}
      {state.featuredRun && state.rankIndex >= 2 && (
        <FeaturedRunCanvas run={state.featuredRun} onClose={handleCloseRun} />
      )}

      {/* Drawer backdrop */}
      <div
        className={`drawer-backdrop${openDrawer ? ' backdrop-visible' : ''}`}
        onClick={() => setOpenDrawer(null)}
      />

      {/* Orders drawer */}
      <aside className={`drawer drawer-orders${openDrawer === 'orders' ? ' drawer-open' : ''}`}>
        <div className="drawer-header">
          <span className="section-heading">Orders</span>
          <button className="drawer-close" onClick={() => setOpenDrawer(null)}>
            ✕
          </button>
        </div>
        <div className="drawer-scroll">
          {state.orders.map(order => {
            const isSelected = order.id === state.activeOrderId;
            const flavorLines = ITEM_FLAVOR_LINES[order.itemType] ?? [];
            const flavor =
              flavorLines.length > 0 ? flavorLines[hashId(order.id) % flavorLines.length] : null;
            return (
              <button
                key={order.id}
                className={`order-card${isSelected ? ' order-selected' : ''}${order.isFeatured ? ' order-featured' : ''}`}
                onClick={() => handleSelectOrder(order.id)}
              >
                <div className="order-card-header">
                  <span className="order-item">{order.isFeatured && state.rankIndex >= 2 ? '✦ ' : ''}{order.itemType}</span>
                  <span className="order-tier" style={{ color: TIER_COLORS[order.customerTier] }}>
                    {order.customerTier}
                  </span>
                </div>
                <div className="order-meta">{previewTime(order)} · {previewPayout(order)}</div>
                {flavor && <div className="order-flavor">{flavor}</div>}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Upgrades drawer */}
      <aside className={`drawer drawer-upgrades${openDrawer === 'upgrades' ? ' drawer-open' : ''}`}>
        <div className="drawer-header">
          <span className="section-heading">Upgrades</span>
          <button className="drawer-close" onClick={() => setOpenDrawer(null)}>
            ✕
          </button>
        </div>
        <div className="drawer-scroll">
          {nextRank && (
            <div className="next-goal">🎯 {nextRank.xpRequired - state.repXp} rep → {nextRank.name}</div>
          )}
          {state.upgrades.map(upgrade => {
            const baseCost = UPGRADE_BASE_COSTS[upgrade.id] ?? 0;
            const cost = upgradeCost(baseCost, upgrade.level);
            const isMaxed = upgrade.level >= upgrade.maxLevel;
            const canAfford = state.gold >= cost;
            const unlockRank = UPGRADE_UNLOCK_RANK[upgrade.id] ?? 0;
            const isLocked = state.rankIndex < unlockRank;
            return (
              <div key={upgrade.id} className={`upgrade-card-drawer${isLocked ? ' upgrade-locked-card' : ''}`}>
                <div className="upgrade-name">{upgrade.name}</div>
                <div className="upgrade-level">
                  Level {upgrade.level} / {upgrade.maxLevel}
                </div>
                <div className="upgrade-effect">{upgradeEffectText(upgrade.id, upgrade.level)}</div>
                {!isMaxed && <div className="upgrade-cost">Next: {cost}g</div>}
                {isLocked && (
                  <div className="upgrade-hint">🔒 Reach {RANKS[unlockRank].name}</div>
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
                        ? { background: '#22c55e', color: '#fff' }
                        : canAfford
                          ? { background: '#7c3aed', color: '#fff' }
                          : undefined
                  }
                >
                  {isLocked ? `Locked` : isMaxed ? 'MAX' : `Buy (${cost}g)`}
                </button>
              </div>
            );
          })}
        </div>
      </aside>

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
      <div className="hud-row">
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
            {state.repXp} rep - Max rank!
          </span>
        )}
        {state.rankIndex >= 1 && eventDef && (
          <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 'normal' }}>
            ⚡ {eventDef.name} ({state.event!.remainingDeliveries} left)
          </span>
        )}
        <span className="hud-objective">🎯 {getNextObjective()}</span>
      </div>

      {/* Forge bench wrapper */}
      <main className="forge-bench-wrapper">
        <div className={`forge-bench${state.crafting && fx?.kind === 'CLANG' ? ' forge-shake' : ''}`}>
          {/* Tutorial chip */}
          {(tutorialStep === 1 || tutorialStep === 2) && (
            <div className="tutorial-chip">
              <span>{TUTORIAL_MESSAGES[tutorialStep]}</span>
              <button onClick={dismissTutorial}>✕</button>
            </div>
          )}

          {/* Next goal */}
          {nextRank && (
            <div className="next-goal">🎯 {nextRank.xpRequired - state.repXp} rep → {nextRank.name}</div>
          )}

          {/* Selected order summary or pick order CTA */}
          {!selectedOrder ? (
            <div className="forge-order-summary no-order">
              <p style={{ color: '#888', marginBottom: '12px' }}>No order selected</p>
              <button className="forge-cta" onClick={() => setOpenDrawer('orders')}>
                📋 Pick an Order
              </button>
            </div>
          ) : (
            <div className="forge-order-summary">
              <div className="order-summary-header">
                <span className="order-summary-item">{selectedOrder.itemType}</span>
                <span className="order-summary-tier" style={{ color: TIER_COLORS[selectedOrder.customerTier] }}>
                  {selectedOrder.customerTier}
                </span>
              </div>
              <div className="order-summary-meta">{previewTime(selectedOrder)} · {previewPayout(selectedOrder)}</div>
              {ITEM_FLAVOR_LINES[selectedOrder.itemType]?.[hashId(selectedOrder.id) % ITEM_FLAVOR_LINES[selectedOrder.itemType].length] && (
                <div className="order-summary-flavor">
                  "{ITEM_FLAVOR_LINES[selectedOrder.itemType][hashId(selectedOrder.id) % ITEM_FLAVOR_LINES[selectedOrder.itemType].length]}"
                </div>
              )}
            </div>
          )}

          {/* Start Craft button (when not crafting and order selected) */}
          {!isCrafting && selectedOrder && (
            <button
              onClick={handleStartCraft}
              style={{
                width: '100%',
                marginBottom: '12px',
                fontSize: '1.05rem',
                fontWeight: 'bold',
                padding: '12px',
                background: '#3a1a4a',
                border: '1px solid #7c3aed',
                color: '#e2c97e',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => ((e.target as HTMLButtonElement).style.background = '#4c1a6a')}
              onMouseLeave={e => ((e.target as HTMLButtonElement).style.background = '#3a1a4a')}
            >
              🔥 Start Craft
            </button>
          )}

          {/* Crafting UI */}
          {isCrafting && (
            <>
              {/* Heat meter */}
              <div className="heat-meter">
                <div className="heat-meter-label">
                  <span>Heat: {Math.round(heat)}°</span>
                </div>
                <div className="heat-meter-bar" style={state.crafting?.lastStrike && state.crafting.lastStrike.ageMs < 300 ? { animation: 'heat-pulse 0.2s' } : {}}>
                  <div
                    style={{
                      width: `${(heat / 100) * 100}%`,
                      height: '100%',
                      background: heatColor,
                      transition: 'width 0.1s linear',
                    }}
                  />
                  {/* Heat zone tick marks */}
                  {[35, 50, 62, 70, 85].map(heatVal => (
                    <div
                      key={heatVal}
                      className={`heat-zone-tick${heatVal === 62 ? ' tick-perfect' : ''}`}
                      style={{ left: `${heatVal}%` }}
                    />
                  ))}
                  {/* GOOD zone band */}
                  <div className="heat-zone-band" style={{ left: '50%', width: '20%' }} />
                </div>
              </div>

              {/* Advisory text */}
              <div
                className={`forge-advisory${
                  strikesRemaining > 0
                    ? heat >= 50 && heat <= 75
                      ? ' advisory-good'
                      : heat < 50
                        ? ' advisory-warn'
                        : ' advisory-warn'
                    : ' advisory-danger'
                }`}
              >
                {strikesRemaining > 0
                  ? heat >= 50 && heat <= 75
                    ? '🟢 Strike now! (ideal quench zone)'
                    : heat < 50
                      ? '🔥 Heat up with Bellows'
                      : '❄️ Cool down before quenching'
                  : `⏱️ Quench now! (auto in ${Math.max(0, Math.round(autoQuenchMs / 1000))}s)`}
              </div>

              {/* Strike summary */}
              <div className="strike-summary">
                Quality: <span style={{ color: '#22c55e' }}>{quality}</span> | Defects:{' '}
                <span style={{ color: '#ef4444' }}>{defects}</span> | Score:{' '}
                <span className="grade-preview">
                  {Math.round(score)} → {liveGrade}
                </span>
              </div>

              {/* Strikes remaining */}
              <div className={`strike-count${strikesRemaining <= 2 ? ' strikes-critical' : ''}`}>
                ⚡ Strikes: {strikesRemaining} remaining
              </div>

              {/* Hammer and Bellows buttons */}
              <div className="forge-actions-row">
                <div style={{ position: 'relative', flex: 1 }}>
                  <button
                    onClick={handleHammer}
                    disabled={!hammerReady || strikesRemaining <= 0}
                    className="action-btn"
                    style={{ opacity: hammerReady && strikesRemaining > 0 ? 1 : 0.6 }}
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
                  className="action-btn"
                  style={{ opacity: bellowsReady ? 1 : 0.6 }}
                >
                  💨 Bellows
                  {bellowsCd > 0 ? ` (${(bellowsCd / 1000).toFixed(1)}s)` : ''}
                </button>
              </div>

              {/* Quench button */}
              <button
                onClick={handleQuench}
                className={`quench-btn ${quenchColor}`}
              >
                🧊 Quench
                {strikesRemaining <= 0 ? ` (auto in ${Math.max(0, Math.round(autoQuenchMs / 1000))}s)` : ''}
              </button>

              {/* Strike feedback */}
              {state.crafting?.lastStrike && state.crafting.lastStrike.ageMs < 1200 && (
                <div
                  className={`strike-feedback feedback-${
                    state.crafting.lastStrike.zone === 'PERFECT'
                      ? 'perfect'
                      : state.crafting.lastStrike.zone === 'GOOD'
                        ? 'good'
                        : 'bad'
                  }`}
                  style={{ opacity: 1 - state.crafting.lastStrike.ageMs / 1200 }}
                >
                  {state.crafting.lastStrike.zone === 'PERFECT'
                    ? `💚 PERFECT! +${state.crafting.lastStrike.qualityDelta}`
                    : state.crafting.lastStrike.zone === 'GOOD'
                      ? `💛 GOOD +${state.crafting.lastStrike.qualityDelta}`
                      : `💔 BAD +${state.crafting.lastStrike.qualityDelta} / +${state.crafting.lastStrike.defectDelta} defects`}
                </div>
              )}
            </>
          )}

          {/* Grade result */}
          {state.lastEvent && (
            <div
              className={`grade-result grade-${
                state.lastEvent.grade === 'S' || state.lastEvent.grade === 'A' || state.lastEvent.grade === 'B'
                  ? 'good'
                  : state.lastEvent.grade === 'C'
                    ? 'mid'
                    : 'bad'
              }`}
            >
              Grade: <strong>{state.lastEvent.grade}</strong> | +{state.lastEvent.goldGained}g · +{state.lastEvent.repGained} rep
            </div>
          )}

          {/* FX overlays */}
          {fx?.kind === 'CLANG' && <div className="clang-pop" key={fx.id}>CLANG!</div>}
          {fx?.kind === 'GOLD' && <div className="gold-float" key={fx.id}>+{fx.amount}g</div>}
          {fx?.kind === 'FAIL' && <div className="fail-flash" key={fx.id} />}
        </div>
      </main>

      {/* Bottom dock */}
      <div className="bottom-dock">
        <button
          className={`dock-btn${tutorialStep === 0 ? ' tutorial-highlight' : ''}`}
          onClick={() => setOpenDrawer('orders')}
        >
          📋 Orders
        </button>
        <button
          className={`dock-btn${tutorialStep === 3 ? ' tutorial-highlight' : ''}`}
          onClick={() => setOpenDrawer('upgrades')}
        >
          ⚙️ Upgrades
        </button>
      </div>
    </div>
  );
}

export default App;
