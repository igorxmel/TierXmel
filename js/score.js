// Вся математика оценок. Единственный источник правды.
// В этом файле не должно быть ни одного зашитого числа из системы оценивания —
// всё приходит из data/meta.json.

/** Собирает индексы для быстрого доступа. Вызывается один раз после загрузки meta. */
export function buildIndex(meta) {
  const blocks = new Map();
  for (const block of meta.blocks) {
    const criteria = new Map();
    for (const crit of block.criteria) criteria.set(crit.id, crit);
    blocks.set(block.id, { ...block, criteriaById: criteria });
  }

  const profiles = new Map();
  for (const profile of meta.profiles) profiles.set(profile.id, profile);

  const fallback = meta.profiles.find((p) => p.fallback) || meta.profiles[meta.profiles.length - 1];

  // Тиры — по убыванию порога, чтобы искать первым совпадением.
  const tiers = [...meta.tiers].sort((a, b) => b.threshold - a.threshold);

  return {
    meta,
    blocks,
    blockOrder: meta.blocks.map((b) => b.id),
    formOrder: [...meta.blocks].sort((a, b) => a.formOrder - b.formOrder).map((b) => b.id),
    profiles,
    fallbackProfile: fallback,
    tiers,
    tiersById: new Map(meta.tiers.map((t) => [t.id, t])),
    badges: new Map(meta.badges.map((b) => [b.id, b])),
    recommendations: new Map(meta.recommendations.map((r) => [r.id, r])),
    statuses: new Map(meta.statuses.map((s) => [s.id, s])),
  };
}

/** Профили игры как массив объектов. Неизвестные и отсутствующие → фоллбэк. */
export function resolveProfiles(game, index) {
  const ids = Array.isArray(game.profile) ? game.profile : game.profile ? [game.profile] : [];
  const found = ids.map((id) => index.profiles.get(id)).filter(Boolean);
  return found.length ? found : [index.fallbackProfile];
}

/**
 * Бюджеты блоков для игры. Поле budget у игры переопределяет всё.
 * При нескольких профилях бюджеты усредняются поэлементно — сумма остаётся qualityMax.
 */
export function resolveBudget(game, index) {
  if (game.budget) return { ...game.budget };

  const profiles = resolveProfiles(game, index);
  const budget = {};
  for (const blockId of index.blockOrder) {
    let sum = 0;
    for (const profile of profiles) sum += profile.budget[blockId] ?? 0;
    budget[blockId] = sum / profiles.length;
  }
  return budget;
}

/** Полный список критериев блока для данных профилей: базовые + extraCriteria. */
export function criteriaFor(blockId, profiles, index) {
  const block = index.blocks.get(blockId);
  if (!block) return [];
  const list = [...block.criteria];
  const seen = new Set(list.map((c) => c.id));
  for (const profile of profiles) {
    for (const extra of profile.extraCriteria ?? []) {
      if (extra.block === blockId && !seen.has(extra.id)) {
        list.push(extra);
        seen.add(extra.id);
      }
    }
  }
  return list;
}

/** Доля блока 0..1 по заполненным критериям. null → блок неактивен. */
function blockFraction(blockData, blockId, profiles, index) {
  if (!blockData) return null;
  const criteria = criteriaFor(blockId, profiles, index);
  let weighted = 0;
  let weightSum = 0;
  let filled = 0;
  for (const crit of criteria) {
    const value = blockData[crit.id];
    if (value === null || value === undefined) continue;
    const weight = crit.weight ?? 1;
    weighted += value * weight;
    weightSum += weight;
    filled += 1;
  }
  if (!weightSum) return null;
  return {
    fraction: weighted / (index.meta.scale.criterionMax * weightSum),
    filled,
    total: criteria.length,
  };
}

/**
 * Основной расчёт. Возвращает null-качество для быстрых и неполных оценок.
 *
 * quick      — блоков нет вообще: игра оценена только кайфом
 * incomplete — блоки есть, но покрытие ниже minCoverage: в тирлист по качеству не берём
 */
export function computeQuality(game, index) {
  const { qualityMax, minCoverage } = index.meta.scale;
  const profiles = resolveProfiles(game, index);
  const budget = resolveBudget(game, index);

  const hasBlocks = !!game.blocks && Object.keys(game.blocks).length > 0;
  if (!hasBlocks) {
    // Быстрая оценка — это «кайф есть, разбора нет». Если нет и кайфа, игра просто без оценки.
    const quick = typeof game.fun === 'number';
    return { quality: null, coverage: 0, quick, incomplete: false, budget, profiles, breakdown: [] };
  }

  const parts = [];
  let activeBudget = 0;
  for (const blockId of index.blockOrder) {
    const info = blockFraction(game.blocks[blockId], blockId, profiles, index);
    const blockBudget = budget[blockId] ?? 0;
    if (!info) {
      parts.push({ blockId, active: false, budget: blockBudget, fraction: null, points: 0, filled: 0, total: 0 });
      continue;
    }
    activeBudget += blockBudget;
    parts.push({ blockId, active: true, budget: blockBudget, ...info, points: 0, effectiveBudget: 0 });
  }

  const coverage = qualityMax ? activeBudget / qualityMax : 0;

  // Guard: активных блоков нет (или они все с нулевым бюджетом) — делить не на что.
  if (!activeBudget || coverage < minCoverage) {
    return { quality: null, coverage, quick: false, incomplete: true, budget, profiles, breakdown: parts };
  }

  const rescale = qualityMax / activeBudget;
  let total = 0;
  for (const part of parts) {
    if (!part.active) continue;
    part.effectiveBudget = part.budget * rescale;
    part.points = part.fraction * part.effectiveBudget;
    total += part.points;
  }

  return {
    quality: Math.round(total),
    coverage,
    quick: false,
    incomplete: false,
    budget,
    profiles,
    breakdown: parts,
  };
}

/** Тир по значению на шкале с заданным максимумом. Пороги в процентах. */
export function tierFor(value, max, index) {
  if (value === null || value === undefined || !max) return null;
  const percent = (value / max) * 100;
  for (const tier of index.tiers) {
    if (percent >= tier.threshold) return tier;
  }
  return index.tiers[index.tiers.length - 1] ?? null;
}

/** Игра + все производные поля. Ничего из этого не хранится в games.json. */
export function computeGame(game, index) {
  const scored = computeQuality(game, index);
  const { qualityMax, funMax } = index.meta.scale;

  let qualityTier = tierFor(scored.quality, qualityMax, index);
  let overridden = false;
  if (game.tierOverride && index.tiersById.has(game.tierOverride)) {
    qualityTier = index.tiersById.get(game.tierOverride);
    overridden = true;
  }

  const fun = typeof game.fun === 'number' ? game.fun : null;
  const status = index.statuses.get(game.status) ?? null;

  return {
    ...game,
    quality: scored.quality,
    coverage: scored.coverage,
    quick: scored.quick,
    incomplete: scored.incomplete,
    budget: scored.budget,
    profiles: scored.profiles,
    breakdown: scored.breakdown,
    qualityTier,
    qualityTierOverridden: overridden,
    fun,
    funTier: tierFor(fun, funMax, index),
    statusMeta: status,
    inTierlist: status ? status.inTierlist !== false : true,
    recommendationMeta: index.recommendations.get(game.recommendation) ?? null,
    badgeList: (game.badges ?? []).map((id) => index.badges.get(id)).filter(Boolean),
  };
}

/** Значение игры по выбранной оси и её тир. */
export function axisValue(game, axis) {
  return axis === 'fun' ? game.fun : game.quality;
}

export function axisTier(game, axis) {
  return axis === 'fun' ? game.funTier : game.qualityTier;
}

// ---------------------------------------------------------------------------
// Валидация. Защита от тихой поломки при правке meta.json и games.json руками.
// ---------------------------------------------------------------------------

const EPS = 1e-6;

export function validateMeta(meta) {
  const issues = [];
  const err = (message) => issues.push({ level: 'error', message });
  const warn = (message) => issues.push({ level: 'warn', message });

  const scale = meta.scale ?? {};
  for (const key of ['qualityMax', 'funMax', 'criterionMax', 'minCoverage']) {
    if (typeof scale[key] !== 'number') err(`scale.${key} должен быть числом`);
  }

  const dupe = (label, items) => {
    const seen = new Set();
    for (const item of items) {
      if (seen.has(item.id)) err(`${label}: повторяющийся id "${item.id}"`);
      seen.add(item.id);
    }
  };

  dupe('tiers', meta.tiers ?? []);
  dupe('blocks', meta.blocks ?? []);
  dupe('profiles', meta.profiles ?? []);
  dupe('badges', meta.badges ?? []);
  dupe('recommendations', meta.recommendations ?? []);
  dupe('statuses', meta.statuses ?? []);

  const tiers = [...(meta.tiers ?? [])].sort((a, b) => b.threshold - a.threshold);
  if (!tiers.length) err('tiers: список пуст');
  if (tiers.length) {
    if (Math.abs(tiers[0].threshold - 100) > EPS) err('tiers: верхний порог должен быть 100%');
    if (Math.abs(tiers[tiers.length - 1].threshold) > EPS) err('tiers: нижний порог должен быть 0%');
    for (let i = 1; i < tiers.length; i += 1) {
      if (tiers[i].threshold >= tiers[i - 1].threshold) {
        err(`tiers: порог "${tiers[i].id}" не ниже "${tiers[i - 1].id}"`);
      }
    }
  }

  const blockIds = new Set((meta.blocks ?? []).map((b) => b.id));
  for (const block of meta.blocks ?? []) {
    dupe(`blocks.${block.id}.criteria`, block.criteria ?? []);
    if (typeof block.formOrder !== 'number') warn(`blocks.${block.id}: нет formOrder`);
    for (const crit of block.criteria ?? []) {
      if (!crit.hint) warn(`критерий ${block.id}.${crit.id}: нет hint`);
    }
  }

  let fallbacks = 0;
  for (const profile of meta.profiles ?? []) {
    if (profile.fallback) fallbacks += 1;
    const budget = profile.budget ?? {};
    let sum = 0;
    for (const [blockId, points] of Object.entries(budget)) {
      if (!blockIds.has(blockId)) err(`profiles.${profile.id}: неизвестный блок "${blockId}"`);
      if (typeof points !== 'number') err(`profiles.${profile.id}.${blockId}: бюджет не число`);
      else sum += points;
    }
    for (const blockId of blockIds) {
      if (!(blockId in budget)) err(`profiles.${profile.id}: нет бюджета для блока "${blockId}"`);
    }
    if (Math.abs(sum - scale.qualityMax) > EPS) {
      err(`profiles.${profile.id}: сумма бюджетов ${sum}, должна быть ${scale.qualityMax}`);
    }
    for (const extra of profile.extraCriteria ?? []) {
      if (!blockIds.has(extra.block)) {
        err(`profiles.${profile.id}.extraCriteria.${extra.id}: неизвестный блок "${extra.block}"`);
        continue;
      }
      const base = (meta.blocks ?? []).find((b) => b.id === extra.block);
      if ((base.criteria ?? []).some((c) => c.id === extra.id)) {
        err(`profiles.${profile.id}.extraCriteria.${extra.id}: id уже есть в блоке "${extra.block}"`);
      }
    }
  }
  if (fallbacks !== 1) err(`profiles: ровно один профиль должен иметь fallback: true (сейчас ${fallbacks})`);

  return issues;
}

export function validateGames(games, index) {
  const issues = [];
  const err = (message) => issues.push({ level: 'error', message });
  const warn = (message) => issues.push({ level: 'warn', message });

  const { qualityMax, funMax, criterionMax } = index.meta.scale;
  const slugs = new Set();
  const uniqueBadgeHolders = new Map();

  for (const game of games) {
    const where = game.slug || game.title || '(без slug)';
    if (!game.slug) err(`${where}: нет slug`);
    else if (slugs.has(game.slug)) err(`${where}: повторяющийся slug`);
    slugs.add(game.slug);

    const ids = Array.isArray(game.profile) ? game.profile : game.profile ? [game.profile] : [];
    for (const id of ids) {
      if (!index.profiles.has(id)) warn(`${where}: неизвестный профиль "${id}", взят фоллбэк`);
    }

    if (game.budget) {
      const sum = Object.values(game.budget).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - qualityMax) > EPS) err(`${where}: budget в сумме ${sum}, должно быть ${qualityMax}`);
    }

    const profiles = resolveProfiles(game, index);
    for (const [blockId, blockData] of Object.entries(game.blocks ?? {})) {
      if (!index.blocks.has(blockId)) {
        err(`${where}: неизвестный блок "${blockId}"`);
        continue;
      }
      const known = new Set(criteriaFor(blockId, profiles, index).map((c) => c.id));
      for (const [critId, value] of Object.entries(blockData ?? {})) {
        if (!known.has(critId)) {
          err(`${where}: неизвестный критерий "${blockId}.${critId}" (не учитывается в расчёте)`);
          continue;
        }
        if (value === null) continue;
        if (typeof value !== 'number' || value < 0 || value > criterionMax) {
          err(`${where}: ${blockId}.${critId} = ${value}, должно быть 0..${criterionMax} или null`);
        }
      }
    }

    if (game.fun !== null && game.fun !== undefined) {
      if (typeof game.fun !== 'number' || game.fun < 0 || game.fun > funMax) {
        err(`${where}: fun = ${game.fun}, должно быть 0..${funMax}`);
      }
    }

    if (game.status && !index.statuses.has(game.status)) err(`${where}: неизвестный статус "${game.status}"`);
    if (game.recommendation && !index.recommendations.has(game.recommendation)) {
      err(`${where}: неизвестный ярлык "${game.recommendation}"`);
    }
    if (game.tierOverride && !index.tiersById.has(game.tierOverride)) {
      err(`${where}: неизвестный tierOverride "${game.tierOverride}"`);
    }

    for (const badgeId of game.badges ?? []) {
      const badge = index.badges.get(badgeId);
      if (!badge) {
        err(`${where}: неизвестный бейдж "${badgeId}"`);
        continue;
      }
      if (badge.unique) {
        const holder = uniqueBadgeHolders.get(badgeId);
        if (holder) err(`бейдж "${badge.label}" уникален, но есть и у "${holder}", и у "${where}"`);
        else uniqueBadgeHolders.set(badgeId, where);
      }
    }
  }

  return issues;
}
