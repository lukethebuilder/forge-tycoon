// FILE: src/App.tsx

import { useState, useEffect, useRef } from 'react';
import type { GameState, Order } from './game/types';
import {
  initState,
  tick,
  selectOrder,
  setFocus,
  startCraft,
  hammer,
  deliver,
  buyUpgrade,
  clearFeaturedRun,
} from './game/engine';
import {
  TONGS_UPGRADE_ID,
  TONGS_TIME_REDUCTION_PER_LEVEL,
  BELLOWS_UPGRADE_ID,
  BELLOWS_PAYOUT_MULT_PER_LEVEL,
  POLISH_UPGRADE_ID,
  POLISH_REP_BONUS_PER_LEVEL,
  APPRENTICE_UPGRADE_ID,
  APPRENTICE_PASSIVE_CRAFT_BONUS_MS_PER_TICK,
  OILSTONE_UPGRADE_ID,
  OILSTONE_SUCCESS_BONUS_PER_LEVEL,
  FRONT_SIGN_UPGRADE_ID,
  FOCUS_TIME_MULTIPLIERS,
  FOCUS_PAYOUT_MULTIPLIERS,
  TIER_MULTIPLIERS,
  UPGRADE_BASE_COSTS,
  upgradeCost,
  RANKS,
  EVENTS,
  MIN_CRAFT_MS,
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
    return `\u2212${(level * TONGS_TIME_REDUCTION_PER_LEVEL * 100).toFixed(0)}% craft time`;
  if (id === BELLOWS_UPGRADE_ID)
    return `+${(level * BELLOWS_PAYOUT_MULT_PER_LEVEL * 100).toFixed(0)}% payout`;
  if (id === POLISH_UPGRADE_ID)
    return `+${level * POLISH_REP_BONUS_PER_LEVEL} rep/success`;
  if (id === APPRENTICE_UPGRADE_ID)
    return `+${level * APPRENTICE_PASSIVE_CRAFT_BONUS_MS_PER_TICK}ms passive/tick`;
  if (id === OILSTONE_UPGRADE_ID)
    return `+${(level * OILSTONE_SUCCESS_BONUS_PER_LEVEL * 100).toFixed(0)}% success chance`;
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

  const tongs = state.upgrades.find(u => u.id === TONGS_UPGRADE_ID)!;
  const isCrafting = state.crafting !== undefined;
  const craftDone = isCrafting && state.crafting!.remainingMs === 0;
  const progressFraction =
    isCrafting && state.crafting!.totalMs > 0
      ? 1 - state.crafting!.remainingMs / state.crafting!.totalMs
      : 0;

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

  function previewTime(order: Order): string {
    const tierMult = TIER_MULTIPLIERS[order.customerTier].timeMult;
    const reduction = 1 - tongs.level * TONGS_TIME_REDUCTION_PER_LEVEL;
    const eventTimeMult = eventDef?.timeMult ?? 1;
    const ms = Math.max(MIN_CRAFT_MS, Math.round(
      order.baseTimeSec * FOCUS_TIME_MULTIPLIERS[state.focus] * tierMult * reduction * eventTimeMult * 1000,
    ));
    return (ms / 1000).toFixed(1) + 's';
  }

  function previewPayout(order: Order): string {
    const tierMult = TIER_MULTIPLIERS[order.customerTier].payoutMult;
    const bellowsLevel = state.upgrades.find(u => u.id === BELLOWS_UPGRADE_ID)?.level ?? 0;
    const bellowsMult = 1 + bellowsLevel * BELLOWS_PAYOUT_MULT_PER_LEVEL;
    const eventPayoutMult = eventDef?.payoutMult ?? 1;
    return (
      Math.round(order.basePayout * FOCUS_PAYOUT_MULTIPLIERS[state.focus] * tierMult * bellowsMult * eventPayoutMult) +
      'g'
    );
  }

  // ─── Tutorial helpers ──────────────────────────────────────────────────────

  const TUTORIAL_MESSAGES: Record<number, string> = {
    0: 'Pick an order to craft.',
    1: 'Choose Rush (fast cash) or Careful (more rep).',
    2: 'Start Craft — then Deliver when it\'s done.',
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

  function handleSetFocus(focus: 'RUSH' | 'CAREFUL') {
    setState(prev => setFocus(prev, focus));
  }

  function handleStartCraft() {
    setState(prev => startCraft(prev));
    triggerFx({ kind: 'CLANG', id: Date.now() }, 800);
  }

  function handleHammer() {
    setState(prev => hammer(prev));
    const t = Date.now();
    triggerFx({
      kind: 'SPARKS',
      id: t,
      sparks: Array.from({ length: 8 }, (_, i) => ({
        angle: (Math.PI * 2 * i) / 8 + Math.random() * 0.4,
        dist: 25 + Math.random() * 35,
      })),
    }, 650);
  }

  function handleDeliver() {
    setState(prev => {
      const next = deliver(prev);
      saveState(next);
      if (next.lastEvent?.success) {
        triggerFx({ kind: 'GOLD', id: Date.now(), amount: next.lastEvent.goldGained }, 1300);
      } else if (next.lastEvent) {
        triggerFx({ kind: 'FAIL', id: Date.now() }, 600);
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

          {/* Stance cards */}
          <div className="stances">
            {(['RUSH', 'CAREFUL'] as const).map(f => (
              <div
                key={f}
                className={[
                  'stance',
                  f === 'RUSH' ? 'stance-rush' : 'stance-careful',
                  state.focus === f ? 'stance-active' : '',
                  isCrafting ? 'stance-disabled' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => !isCrafting && handleSetFocus(f)}
              >
                <span className="stance-icon">{f === 'RUSH' ? '⚡' : '🎯'}</span>
                <span className="stance-name">{f === 'RUSH' ? 'Rush' : 'Careful'}</span>
                <span className="stance-flavor">
                  {f === 'RUSH' ? 'Fast cash. Less rep.' : 'Slower. More rep.'}
                </span>
              </div>
            ))}
          </div>

          {/* Start Craft */}
          <button
            onClick={handleStartCraft}
            disabled={!state.activeOrderId || isCrafting}
            style={{
              marginTop: '4px',
              fontSize: '1.05rem',
              fontWeight: 'bold',
              padding: '0.7em 1.2em',
            }}
          >
            {isCrafting ? 'Crafting…' : 'Start Craft'}
          </button>

          {/* Progress bar */}
          {isCrafting && (
            <div style={{
              background: '#222',
              borderRadius: '6px',
              height: '20px',
              overflow: 'hidden',
              marginTop: '4px',
            }}>
              <div style={{
                width: `${progressFraction * 100}%`,
                height: '100%',
                background: craftDone ? '#22c55e' : '#7c3aed',
                transition: 'width 0.25s linear',
              }} />
            </div>
          )}

          {isCrafting && (
            <div style={{ fontSize: '0.8rem', color: '#aaa', textAlign: 'center' }}>
              {craftDone
                ? 'Done! Click Deliver.'
                : `${(state.crafting!.remainingMs / 1000).toFixed(1)}s remaining`}
            </div>
          )}

          {/* Hammer */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={handleHammer}
              disabled={
                !isCrafting ||
                (state.crafting?.hammerCooldownMs ?? 0) > 0 ||
                craftDone
              }
              style={{ width: '100%' }}
            >
              🔨 Hammer!
              {state.crafting && state.crafting.hammerCooldownMs > 0
                ? ` (${(state.crafting.hammerCooldownMs / 1000).toFixed(1)}s)`
                : ''}
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

          {/* Deliver */}
          <button
            onClick={handleDeliver}
            disabled={!craftDone}
            style={
              craftDone
                ? { background: '#22c55e', color: '#fff', fontWeight: 'bold', fontSize: '1.05rem' }
                : undefined
            }
          >
            Deliver
          </button>

          {/* Recent result */}
          {state.lastEvent && (
            <div style={{
              fontSize: '0.85rem',
              color: state.lastEvent.success ? '#22c55e' : '#ef4444',
              textAlign: 'center',
              marginTop: '2px',
            }}>
              {state.lastEvent.success
                ? `+${state.lastEvent.goldGained}g · +${state.lastEvent.repGained} rep`
                : `+${state.lastEvent.goldGained}g · No rep gained`}
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
