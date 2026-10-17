
/* ═══════════════════════════════════════════════════════
   CONSTANTES
   ═══════════════════════════════════════════════════════ */
const TOOLS_MAP = {
  equity: {
    title: 'Equity Calculator',
    icon: '🎯',
    url: '/tool/equity'
  },
  preflop: {
    title: 'Preflop Strategy Editor',
    icon: '📋',
    url: '/tool/preflop'
  }
};

/* ═══════════════════════════════════════════════════════
   UI HELPERS
   ═══════════════════════════════════════════════════════ */
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

function setLoading(on) {
  document.getElementById('loadingOverlay').classList.toggle('show', on);
}

function setConnStatus(status, text) {
  const el = document.getElementById('connIndicator');
  if (el) {
    el.classList.remove('online', 'offline');
    if (status) el.classList.add(status);
    const ct = el.querySelector('.ctext');
    if (ct) ct.textContent = text || '—';
  }
  const udot = document.querySelector('.user-chip .udot');
  if (udot) {
    udot.style.background = status === 'online' ? 'var(--green)' : (status === 'offline' ? 'var(--red)' : 'var(--text-3)');
    udot.style.boxShadow = status === 'online' ? '0 0 8px var(--green)' : 'none';
  }
  const chip = document.querySelector('.user-chip');
  if (chip) {
    chip.classList.remove('online', 'offline');
    if (status) chip.classList.add(status);
    chip.title = status === 'online' ? 'Conectado · Sesión actual' : (status === 'offline' ? 'Sesión actual' : 'Sesión actual');
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ═══════════════════════════════════════════════════════
   SPLASH
   ═══════════════════════════════════════════════════════ */
setTimeout(() => {
  document.getElementById('splash').classList.add('hide');
  document.getElementById('app').classList.add('ready');
}, 1400);

/* ═══════════════════════════════════════════════════════
   DETECCIÓN DE SITIO + PARSERS
   ═══════════════════════════════════════════════════════ */
function detectarSitio(text) {
  if (/CoinPoker Hand #/i.test(text)) return 'coinpoker';
  if (/PokerStars Hand #/i.test(text)) return 'pokerstars';

  if (/^\s*HH\d{8}\s+SCHEDULEDID-/i.test(text)) return 'acr';
  if (/Winning Poker Network/i.test(text)) return 'acr';
  if (/Americas Cardroom/i.test(text)) return 'acr';
  if (/BlackChipPoker|BlackChip Poker/i.test(text)) return 'acr';
  if (/\bACR\b/i.test(text)) return 'acr';
  if (/Game Hand #\d+\s*-\s*Tournament #\d+\s*-\s*Holdem \(No Limit\)\s*-\s*Level \d+\s*\([\d,]+\.\d+\/[\d,]+\.\d+\)\s*-\s*[\d\/]+\s+[\d:]+\s*UTC/i.test(text)) {
    return 'acr';
  }

  if (/^\s*Game Hand #\d+ - Tournament #\d+/im.test(text)) return 'generic';
  if (/#Game No :/i.test(text)) return 'generic';

  return 'unknown';
}

function parseCoinPokerLog(text) {
  const hands = [];
  const bloques = text.split(/\n(?=CoinPoker Hand #)/);
  for (const b of bloques) {
    const h = parseCoinPokerHand(b);
    if (h) hands.push(h);
  }
  return hands;
}

function parseCoinPokerHand(bloque) {
  const rawLines = bloque.split('\n').map(l => l.replace(/\r$/, ''));
  const lines = rawLines.map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const hand = {
    id: null, site: 'coinpoker', tournament: null, tournamentName: null,
    level: null, blinds: null, ante: 0,
    date: null, table: null, tableMax: null, button: null,
    players: [], actions: [], board: [],
    hero: null, hero_cards: [],
    hero_net: 0, hero_net_bb: 0,
    hero_folded: false, hero_showdown: false,
    winner: null, pot_total: 0, bb: 1, sb: 0
  };

  const mh = lines[0].match(/CoinPoker Hand #(\d+):\s*(\w+)\s*\(([\d.,]+)\/([\d.,]+)(?:\/([\d.,]+))?\)\s*([\d\/]+ [\d:]+)\s*(\w+)/i);
  if (!mh) return null;
  hand.id = mh[1];
  hand.gameType = mh[2];
  hand.sb = parseFloat((mh[3]||'0').replace(/,/g,''));
  hand.bb = parseFloat((mh[4]||'1').replace(/,/g,'')) || 1;
  hand.ante = mh[5] ? parseFloat(mh[5].replace(/,/g,'')) : 0;
  hand.blinds = [hand.sb, hand.bb];
  hand.date = mh[6] + ' ' + mh[7];

  const mt = lines[1] && lines[1].match(/Tournament '([^']+)' '([^']+)' (\d+)-max Seat #(\d+) is the button/i);
  if (mt) {
    hand.tournamentName = mt[1];
    hand.tournament = mt[2];
    hand.tableMax = parseInt(mt[3], 10);
    hand.button = parseInt(mt[4], 10);
  }

  for (const line of lines) {
    const mp = line.match(/^Seat (\d+): ([^\s:]+) \(([\d,.]+) in chips\)/i);
    if (mp) {
      hand.players.push({
        seat: parseInt(mp[1], 10),
        name: mp[2],
        stack: parseFloat(mp[3].replace(/,/g,'')),
        sitting_out: false,
        waiting: false
      });
    }
  }

  let street = 'preflop';
  let board_cards = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;

    if ((m = line.match(/^Dealt to (.+?) \[([^\]]+)\]/))) {
      hand.hero = m[1].trim();
      hand.hero_cards = m[2].split(/\s+/).filter(Boolean);
      hand.actions.push({ type: 'deal_hole', player: hand.hero, cards: hand.hero_cards, street: 'preflop' });
      continue;
    }
    if ((m = line.match(/^Dealt to (.+?)\s*$/))) {
      hand.actions.push({ type: 'deal_hole', player: m[1].trim(), cards: [], street: 'preflop' });
      continue;
    }

    if ((m = line.match(/^([^\s:]+): posts ante ([\d,.]+)/i))) {
      hand.actions.push({ type: 'ante', player: m[1], amount: parseFloat(m[2].replace(/,/g,'')), street: 'preflop' });
      continue;
    }
    if ((m = line.match(/^([^\s:]+): posts small blind ([\d,.]+)/i))) {
      hand.actions.push({ type: 'blind', player: m[1], blind: 'small blind', amount: parseFloat(m[2].replace(/,/g,'')), street: 'preflop' });
      continue;
    }
    if ((m = line.match(/^([^\s:]+): posts big blind ([\d,.]+)/i))) {
      hand.actions.push({ type: 'blind', player: m[1], blind: 'big blind', amount: parseFloat(m[2].replace(/,/g,'')), street: 'preflop' });
      continue;
    }

    if ((m = line.match(/^\*\*\* (FLOP|TURN|RIVER) \*\*\* \[([^\]]+)\]/i))) {
      street = m[1].toLowerCase();
      const re = /([2-9TJQKA][shdc])/g;
      let mm;
      while ((mm = re.exec(line)) !== null) {
        if (!board_cards.includes(mm[1])) board_cards.push(mm[1]);
      }
      hand.board = [...board_cards];
      hand.actions.push({ type: 'street', street, board: [...board_cards] });
      continue;
    }
    if (/^\*\*\* SHOWDOWN \*\*\*/i.test(line)) { street = 'showdown'; continue; }
    if (/^\*\*\* SUMMARY \*\*\*/i.test(line)) { street = 'summary'; continue; }

    if ((m = line.match(/^([^\s:]+): folds$/i))) {
      hand.actions.push({ type: 'fold', player: m[1], street });
      continue;
    }
    if ((m = line.match(/^([^\s:]+): checks$/i))) {
      hand.actions.push({ type: 'check', player: m[1], street });
      continue;
    }
    if ((m = line.match(/^([^\s:]+): calls ([\d,.]+)/i))) {
      hand.actions.push({ type: 'call', player: m[1], amount: parseFloat(m[2].replace(/,/g,'')), street });
      continue;
    }
    if ((m = line.match(/^([^\s:]+): ALLIN ([\d,.]+)/i))) {
      const amt = parseFloat(m[2].replace(/,/g,''));
      hand.actions.push({ type: 'allin', player: m[1], amount: amt, to: amt, street, allin: true });
      continue;
    }
    if ((m = line.match(/^([^\s:]+): bets ([\d,.]+)/i))) {
      hand.actions.push({ type: 'bet', player: m[1], amount: parseFloat(m[2].replace(/,/g,'')), street });
      continue;
    }
    if ((m = line.match(/^([^\s:]+): raises ([\d,.]+) to ([\d,.]+)/i))) {
      hand.actions.push({
        type: 'raise', player: m[1],
        amount: parseFloat(m[2].replace(/,/g,'')),
        to: parseFloat(m[3].replace(/,/g,'')),
        street
      });
      continue;
    }
    if ((m = line.match(/^([^\s:]+): RETURN ([\d,.]+)/i))) {
      hand.actions.push({ type: 'return', player: m[1], amount: parseFloat(m[2].replace(/,/g,'')), street });
      continue;
    }
    if ((m = line.match(/^([^\s:]+): shows \[([^\]]+)\] \(([^)]+)\)/i))) {
      hand.actions.push({ type: 'show', player: m[1], cards: m[2].split(/\s+/).filter(Boolean), desc: m[3], street: 'showdown' });
      if (hand.hero && m[1] === hand.hero) hand.hero_showdown = true;
      continue;
    }
    if ((m = line.match(/^([^\s:]+): mucks hand/i))) {
      hand.actions.push({ type: 'muck', player: m[1], street: 'showdown' });
      continue;
    }
    if ((m = line.match(/^([^\s:]+) collected ([\d,.]+) from pot/i))) {
      hand.actions.push({ type: 'collect', player: m[1], amount: parseFloat(m[2].replace(/,/g,'')), pot: 'main', street });
      continue;
    }
    if ((m = line.match(/^([^\s:]+) collected ([\d,.]+) from (main pot|side pot.*)/i))) {
      hand.actions.push({ type: 'collect', player: m[1], amount: parseFloat(m[2].replace(/,/g,'')), pot: m[3], street });
      continue;
    }

    if ((m = line.match(/^Total pot ([\d,.]+)/i))) {
      hand.pot_total = parseFloat(m[1].replace(/,/g,''));
      continue;
    }
    if ((m = line.match(/^Board \[ ([^\]]+) \]/i))) {
      const cards = m[1].split(/\s+/).filter(Boolean);
      if (cards.length) hand.board = cards;
      continue;
    }
    if ((m = line.match(/^Seat \d+: ([^\s:]+) (won|folded|showed|didn't show|mucked)(.*)/i))) {
      const name = m[1];
      const verb = m[2].toLowerCase();
      const rest = m[3] || '';
      if (verb === 'won') {
        const wm = rest.match(/\(([\d,.]+)\)/);
        const amt = wm ? parseFloat(wm[1].replace(/,/g,'')) : 0;
        hand.actions.push({ type: 'collect', player: name, amount: amt, pot: 'summary', street: 'summary' });
      } else if (verb === 'showed') {
        const sm = rest.match(/\[([^\]]+)\] (.*)/);
        if (sm) {
          hand.actions.push({ type: 'show', player: name, cards: sm[1].split(/\s+/).filter(Boolean), desc: sm[2], street: 'summary' });
          if (hand.hero && name === hand.hero) hand.hero_showdown = true;
        }
      }
      continue;
    }
  }

  if (!hand.hero && hand.players.length) {
    for (const a of hand.actions) {
      if (a.type === 'deal_hole' && a.cards && a.cards.length) {
        hand.hero = a.player;
        hand.hero_cards = a.cards;
        break;
      }
    }
  }

  if (hand.hero) {
    let ganado = 0, gastado = 0, devuelto = 0;
    for (const a of hand.actions) {
      if (a.player !== hand.hero) continue;
      if (a.type === 'collect') ganado += a.amount || 0;
      else if (a.type === 'return') devuelto += a.amount || 0;
      else if (['ante','blind','call','bet','allin'].includes(a.type)) gastado += a.amount || 0;
      else if (a.type === 'raise') gastado += (a.amount != null ? a.amount : (a.to || 0));
    }
    hand.hero_net = Math.round((ganado + devuelto - gastado) * 100) / 100;
    hand.hero_net_bb = hand.bb > 0 ? Math.round((hand.hero_net / hand.bb) * 100) / 100 : 0;
    hand.hero_folded = hand.actions.some(a => a.type === 'fold' && a.player === hand.hero);
  }

  const collectors = [...new Set(hand.actions.filter(a => a.type === 'collect' && a.pot !== 'summary').map(a => a.player))];
  if (collectors.length === 1) hand.winner = collectors[0];
  else if (!hand.winner && hand.hero && hand.hero_net > 0) hand.winner = hand.hero;

  if (!hand.pot_total) {
    hand.pot_total = Math.round(
      hand.actions.filter(a => a.type === 'collect' && a.pot !== 'summary').reduce((s,a) => s + a.amount, 0) * 100
    ) / 100 || Math.round(hand.actions.filter(a => a.type === 'collect').reduce((s,a) => s + a.amount, 0) * 100) / 100;
  }

  return hand;
}

function parseACRLog(text) {
  const hands = [];
  let cleanText = text;
  const primeraLinea = text.split('\n', 1)[0];
  if (/^\s*HH\d{8}\s+SCHEDULEDID-/i.test(primeraLinea)) {
    cleanText = text.slice(primeraLinea.length).replace(/^\s*\n/, '');
  }
  const bloques = cleanText.split(/\n(?=Game Hand #)/);
  for (const b of bloques) {
    const h = parseACRHand(b);
    if (h) hands.push(h);
  }
  return hands;
}

function parseACRHand(bloque) {
  const rawLines = bloque.split('\n').map(l => l.replace(/\r$/, ''));
  const lines = rawLines.map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const hand = {
    id: null, site: 'acr', tournament: null, tournamentName: null,
    level: null, blinds: null, ante: 0,
    date: null, table: null, tableMax: null, button: null,
    players: [], actions: [], board: [],
    hero: null, hero_cards: [],
    hero_net: 0, hero_net_bb: 0,
    hero_folded: false, hero_showdown: false,
    winner: null, pot_total: 0, bb: 1, sb: 0
  };

  const mh = lines[0].match(
    /Game Hand #(\d+)\s*-\s*Tournament #(\d+)\s*-\s*(\w+)\s*\(([^)]+)\)\s*-\s*Level (\d+)\s*\(([\d.,]+)\/([\d.,]+)\)\s*-\s*([\d\/]+ [\d:]+)\s*(\w+)/i
  );
  if (!mh) return null;

  hand.id = mh[1];
  hand.tournament = mh[2];
  hand.gameType = mh[3];
  hand.limit = mh[4];
  hand.level = parseInt(mh[5], 10);
  hand.sb = parseFloat(mh[6].replace(/,/g, ''));
  hand.bb = parseFloat(mh[7].replace(/,/g, '')) || 1;
  hand.blinds = [hand.sb, hand.bb];
  hand.date = mh[8] + ' ' + mh[9];

  const mt = lines[1] && lines[1].match(/Table '([^']+)' (\d+)-max Seat #(\d+) is the button/i);
  if (mt) {
    hand.table = mt[1];
    hand.tableMax = parseInt(mt[2], 10);
    hand.button = parseInt(mt[3], 10);
  }

  for (const line of lines) {
    let mp = line.match(/^Seat (\d+): ([^\s:]+) \(([\d,.]+)\)(.*)/i);
    if (mp) {
      hand.players.push({
        seat: parseInt(mp[1], 10),
        name: mp[2],
        stack: parseFloat(mp[3].replace(/,/g, '')),
        sitting_out: /sitting out/i.test(mp[4] || ''),
        waiting: false
      });
      continue;
    }
    mp = line.match(/^Seat (\d+): ([^\s:]+) will be allowed to play after the button/i);
    if (mp) {
      hand.players.push({
        seat: parseInt(mp[1], 10),
        name: mp[2],
        stack: 0,
        sitting_out: false,
        waiting: true
      });
    }
  }

  let street = 'preflop';
  let board_cards = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;

    if (/^Main pot [\d,.]+$/i.test(line)) continue;
    if (/^Side pot(?:\((\d+)\))? [\d,.]+$/i.test(line)) continue;

    if ((m = line.match(/^Dealt to (.+?) \[([^\]]+)\]/))) {
      hand.hero = m[1].trim();
      hand.hero_cards = m[2].split(/\s+/).filter(Boolean);
      hand.actions.push({ type: 'deal_hole', player: hand.hero, cards: hand.hero_cards, street: 'preflop' });
      continue;
    }

    if ((m = line.match(/^([^\s:]+) posts ante ([\d,.]+)(.*)$/i))) {
      hand.actions.push({ type: 'ante', player: m[1], amount: parseFloat(m[2].replace(/,/g, '')), street: 'preflop' });
      continue;
    }
    if ((m = line.match(/^([^\s:]+) posts the small blind ([\d,.]+)(.*)$/i))) {
      hand.actions.push({ type: 'blind', player: m[1], blind: 'small blind', amount: parseFloat(m[2].replace(/,/g, '')), street: 'preflop' });
      continue;
    }
    if ((m = line.match(/^([^\s:]+) posts the big blind ([\d,.]+)(.*)$/i))) {
      hand.actions.push({ type: 'blind', player: m[1], blind: 'big blind', amount: parseFloat(m[2].replace(/,/g, '')), street: 'preflop' });
      continue;
    }

    if ((m = line.match(/^\*\*\* (FLOP|TURN|RIVER) \*\*\* \[([^\]]+)\]/i))) {
      street = m[1].toLowerCase();
      const re = /([2-9TJQKA][shdc])/g;
      let mm;
      while ((mm = re.exec(line)) !== null) {
        if (!board_cards.includes(mm[1])) board_cards.push(mm[1]);
      }
      hand.board = [...board_cards];
      hand.actions.push({ type: 'street', street, board: [...board_cards] });
      continue;
    }
    if (/^\*\*\* SHOW ?DOWN \*\*\*/i.test(line)) { street = 'showdown'; continue; }
    if (/^\*\*\* SUMMARY \*\*\*/i.test(line)) { street = 'summary'; continue; }

    if ((m = line.match(/^([^\s:]+) folds$/i))) {
      hand.actions.push({ type: 'fold', player: m[1], street });
      continue;
    }
    if ((m = line.match(/^([^\s:]+) checks$/i))) {
      hand.actions.push({ type: 'check', player: m[1], street });
      continue;
    }

    if ((m = line.match(/^([^\s:]+) raises ([\d,.]+) to ([\d,.]+) and is all-in/i))) {
      hand.actions.push({ type: 'allin', player: m[1], amount: parseFloat(m[2].replace(/,/g, '')), to: parseFloat(m[3].replace(/,/g, '')), street, allin: true });
      continue;
    }
    if ((m = line.match(/^([^\s:]+) raises ([\d,.]+) to ([\d,.]+)/i))) {
      hand.actions.push({ type: 'raise', player: m[1], amount: parseFloat(m[2].replace(/,/g, '')), to: parseFloat(m[3].replace(/,/g, '')), street });
      continue;
    }
    if ((m = line.match(/^([^\s:]+) bets ([\d,.]+) and is all-in/i))) {
      hand.actions.push({ type: 'allin', player: m[1], amount: parseFloat(m[2].replace(/,/g, '')), street, allin: true });
      continue;
    }
    if ((m = line.match(/^([^\s:]+) bets ([\d,.]+)/i))) {
      hand.actions.push({ type: 'bet', player: m[1], amount: parseFloat(m[2].replace(/,/g, '')), street });
      continue;
    }
    if ((m = line.match(/^([^\s:]+) calls ([\d,.]+) and is all-in/i))) {
      hand.actions.push({ type: 'allin', player: m[1], amount: parseFloat(m[2].replace(/,/g, '')), street, allin: true });
      continue;
    }
    if ((m = line.match(/^([^\s:]+) calls ([\d,.]+)/i))) {
      hand.actions.push({ type: 'call', player: m[1], amount: parseFloat(m[2].replace(/,/g, '')), street });
      continue;
    }

    if ((m = line.match(/^Uncalled bet \(([\d,.]+)\) returned to ([^\s:]+)/i))) {
      hand.actions.push({ type: 'return', player: m[2], amount: parseFloat(m[1].replace(/,/g, '')), street });
      continue;
    }

    if ((m = line.match(/^([^\s:]+) shows \[([^\]]+)\] \((.*)\)/i))) {
      hand.actions.push({ type: 'show', player: m[1], cards: m[2].split(/\s+/).filter(Boolean), desc: m[3], street: 'showdown' });
      if (hand.hero && m[1] === hand.hero) hand.hero_showdown = true;
      continue;
    }
    if ((m = line.match(/^([^\s:]+) shows \[([^\]]+)\]\s*$/i))) {
      hand.actions.push({ type: 'show', player: m[1], cards: m[2].split(/\s+/).filter(Boolean), desc: '', street: 'showdown' });
      if (hand.hero && m[1] === hand.hero) hand.hero_showdown = true;
      continue;
    }
    if ((m = line.match(/^([^\s:]+) (?:does not show|did not show)/i))) {
      hand.actions.push({ type: 'muck', player: m[1], street: 'showdown' });
      continue;
    }
    if ((m = line.match(/^([^\s:]+) mucks hand/i))) {
      hand.actions.push({ type: 'muck', player: m[1], street: 'showdown' });
      continue;
    }

    if ((m = line.match(/^([^\s:]+) collected ([\d,.]+) from (main pot|side pot-?\d*)/i))) {
      hand.actions.push({ type: 'collect', player: m[1], amount: parseFloat(m[2].replace(/,/g, '')), pot: m[3], street });
      continue;
    }
    if ((m = line.match(/^([^\s:]+) collected ([\d,.]+) from pot/i))) {
      hand.actions.push({ type: 'collect', player: m[1], amount: parseFloat(m[2].replace(/,/g, '')), pot: 'main', street });
      continue;
    }

    if ((m = line.match(/^Total pot ([\d,.]+)/i))) {
      hand.pot_total = parseFloat(m[1].replace(/,/g, ''));
      continue;
    }
    if ((m = line.match(/^Board \[ ([^\]]+) \]/i))) {
      const cards = m[1].split(/\s+/).filter(Boolean);
      if (cards.length) hand.board = cards;
      continue;
    }

    if ((m = line.match(/^Seat \d+: ([^\s:]+)\s*(?:\([^)]+\))?\s+(.*)$/i))) {
      const name = m[1];
      const rest = m[2] || '';
      const wonM = rest.match(/and won ([\d,.]+)/i);
      if (wonM) {
        hand.actions.push({ type: 'collect', player: name, amount: parseFloat(wonM[1].replace(/,/g, '')), pot: 'summary', street: 'summary' });
      }
      const showM = rest.match(/showed \[([^\]]+)\]/i);
      if (showM) {
        hand.actions.push({ type: 'show', player: name, cards: showM[1].split(/\s+/).filter(Boolean), desc: rest, street: 'summary' });
        if (hand.hero && name === hand.hero) hand.hero_showdown = true;
      }
      continue;
    }
  }

  if (!hand.hero && hand.players.length) {
    for (const a of hand.actions) {
      if (a.type === 'deal_hole' && a.cards && a.cards.length) {
        hand.hero = a.player;
        hand.hero_cards = a.cards;
        break;
      }
    }
  }

  if (hand.hero) {
    let ganado = 0, gastado = 0, devuelto = 0;
    for (const a of hand.actions) {
      if (a.player !== hand.hero) continue;
      if (a.type === 'collect') ganado += a.amount || 0;
      else if (a.type === 'return') devuelto += a.amount || 0;
      else if (['ante','blind','call','bet','allin'].includes(a.type)) gastado += a.amount || 0;
      else if (a.type === 'raise') gastado += (a.amount != null ? a.amount : (a.to || 0));
    }
    hand.hero_net = Math.round((ganado + devuelto - gastado) * 100) / 100;
    hand.hero_net_bb = hand.bb > 0 ? Math.round((hand.hero_net / hand.bb) * 100) / 100 : 0;
    hand.hero_folded = hand.actions.some(a => a.type === 'fold' && a.player === hand.hero);
  }

  const collectors = [...new Set(hand.actions.filter(a => a.type === 'collect' && a.pot !== 'summary').map(a => a.player))];
  if (collectors.length === 1) hand.winner = collectors[0];
  else if (!hand.winner && hand.hero && hand.hero_net > 0) hand.winner = hand.hero;

  if (!hand.pot_total) {
    hand.pot_total = Math.round(
      hand.actions.filter(a => a.type === 'collect' && a.pot !== 'summary').reduce((s, a) => s + a.amount, 0) * 100
    ) / 100;
  }

  if (!hand.tournamentName) hand.tournamentName = `Torneo ${hand.tournament}`;

  return hand;
}

function parsePokerStarsLog(text) {
  const adapted = text.replace(/PokerStars Hand #/g, 'Game Hand #');
  return parseGenericLog(adapted);
}

function parseGenericLog(text) {
  const hands = [];
  const bloques = text.split(/\n(?=Game Hand #|#Game No :)/);
  for (const b of bloques) {
    const t = b.trim();
    if (!t) continue;
    const h = parseHandGeneric(b);
    if (h) hands.push(h);
  }
  return hands;
}

function parseHandGeneric(bloque) {
  const lines = bloque.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const hand = {
    id: null, site: 'generic', tournament: null, tournamentName: null,
    level: null, blinds: null, date: null, table: null, button: null,
    players: [], actions: [], board: [],
    hero: null, hero_cards: [],
    hero_net: 0, hero_net_bb: 0,
    hero_folded: false, hero_showdown: false,
    winner: null, pot_total: 0, bb: 1
  };

  const mh = lines[0].match(/Game Hand #(\d+) - Tournament #(\d+) - Holdem \(No Limit\) - Level (\d+) \(([\d.]+)\/([\d.]+)\) - ([\d\/]+ [\d:]+ UTC)/);
  if (mh) {
    hand.id = mh[1]; hand.tournament = mh[2];
    hand.level = parseInt(mh[3]);
    hand.blinds = [parseFloat(mh[4]), parseFloat(mh[5])];
    hand.bb = parseFloat(mh[5]) || 1;
    hand.date = mh[6];
  } else {
    const mid = lines[0].match(/#(\d+)/);
    if (mid) hand.id = mid[1];
  }

  const mt = lines[1] && lines[1].match(/Table '(\d+)' (\d+)-max Seat #(\d+) is the button/);
  if (mt) { hand.table = mt[1]; hand.button = parseInt(mt[3]); }

  for (const line of lines) {
    let mp = line.match(/^Seat (\d+): ([^\s:]+) \(([\d.]+)\)(.*)/);
    if (mp) {
      hand.players.push({
        seat: parseInt(mp[1]), name: mp[2], stack: parseFloat(mp[3]),
        sitting_out: /sitting out/i.test(mp[4]||''), waiting: false
      });
      continue;
    }
    mp = line.match(/^Seat (\d+): ([^\s:]+) will be allowed to play after the button/i);
    if (mp) {
      hand.players.push({ seat: parseInt(mp[1]), name: mp[2], stack: 0, sitting_out: true, waiting: true });
    }
  }

  let street = 'preflop';
  let board_cards = [];

  for (const line of lines) {
    let m;
    if ((m = line.match(/^Dealt to (.+?) \[([^\]]+)\]/))) {
      hand.hero = m[1].trim();
      hand.hero_cards = m[2].split(/\s+/).filter(Boolean);
      hand.actions.push({ type: 'deal_hole', player: hand.hero, cards: hand.hero_cards, street: 'preflop' });
      continue;
    }
    if ((m = line.match(/^([^\s:]+) posts ante ([\d.]+)/))) {
      hand.actions.push({ type: 'ante', player: m[1], amount: parseFloat(m[2]), street: 'preflop' }); continue;
    }
    if ((m = line.match(/^([^\s:]+) posts (the small blind|the big blind) ([\d.]+)/))) {
      hand.actions.push({ type: 'blind', player: m[1], blind: m[2], amount: parseFloat(m[3]), street: 'preflop' }); continue;
    }
    if ((m = line.match(/^([^\s:]+) folds/))) { hand.actions.push({ type: 'fold', player: m[1], street }); continue; }
    if ((m = line.match(/^([^\s:]+) checks/))) { hand.actions.push({ type: 'check', player: m[1], street }); continue; }
    if ((m = line.match(/^([^\s:]+) raises ([\d.]+) to ([\d.]+) and is all-in/i))) {
      hand.actions.push({ type: 'allin', player: m[1], amount: parseFloat(m[2]), to: parseFloat(m[3]), street, allin: true }); continue;
    }
    if ((m = line.match(/^([^\s:]+) (bets|calls) ([\d.]+) and is all-in/i))) {
      hand.actions.push({ type: 'allin', player: m[1], amount: parseFloat(m[3]), street, allin: true }); continue;
    }
    if ((m = line.match(/^([^\s:]+) calls ([\d.]+)/))) { hand.actions.push({ type: 'call', player: m[1], amount: parseFloat(m[2]), street }); continue; }
    if ((m = line.match(/^([^\s:]+) bets ([\d.]+)/))) { hand.actions.push({ type: 'bet', player: m[1], amount: parseFloat(m[2]), street }); continue; }
    if ((m = line.match(/^([^\s:]+) raises ([\d.]+) to ([\d.]+)/))) {
      hand.actions.push({ type: 'raise', player: m[1], amount: parseFloat(m[2]), to: parseFloat(m[3]), street }); continue;
    }
    if ((m = line.match(/^\*\*\* (FLOP|TURN|RIVER) \*\*\* \[([^\]]+)\]/))) {
      street = m[1].toLowerCase();
      const re = /([2-9TJQKA][shdc])/g;
      let mm;
      while ((mm = re.exec(line)) !== null) {
        if (!board_cards.includes(mm[1])) board_cards.push(mm[1]);
      }
      hand.board = [...board_cards];
      hand.actions.push({ type: 'street', street, board: [...board_cards] });
      continue;
    }
    if ((m = line.match(/^([^\s:]+) shows \[([^\]]+)\] \((.*)\)/))) {
      hand.actions.push({ type: 'show', player: m[1], cards: m[2].split(/\s+/), desc: m[3], street });
      if (hand.hero && m[1] === hand.hero) hand.hero_showdown = true;
      continue;
    }
    if ((m = line.match(/^([^\s:]+) collected ([\d.]+) from (main pot|side pot.*)/))) {
      hand.actions.push({ type: 'collect', player: m[1], amount: parseFloat(m[2]), pot: m[3], street }); continue;
    }
    if ((m = line.match(/^Uncalled bet \(([\d.]+)\) returned to ([^\s:]+)/))) {
      hand.actions.push({ type: 'return', player: m[2], amount: parseFloat(m[1]), street }); continue;
    }
    if ((m = line.match(/^Seat \d+: ([^\s:]+).*?\band won ([\d.]+)/i))) {
      const playerName = m[1], amount = parseFloat(m[2]);
      const ya = hand.actions.some(a => a.type === 'collect' && a.player === playerName && Math.abs((a.amount||0)-amount) < 0.01);
      if (!ya) hand.actions.push({ type: 'collect', player: playerName, amount, pot: 'summary', street });
    }
  }

  if (!hand.hero && hand.players.length) {
    for (const a of hand.actions) {
      if (a.type === 'deal_hole' && a.cards && a.cards.length) { hand.hero = a.player; hand.hero_cards = a.cards; break; }
    }
  }

  if (hand.hero) {
    let ganado = 0, gastado = 0, devuelto = 0;
    for (const a of hand.actions) {
      if (a.player !== hand.hero) continue;
      if (a.type === 'collect') ganado += a.amount || 0;
      else if (a.type === 'return') devuelto += a.amount || 0;
      else if (['ante','blind','call','bet','allin'].includes(a.type)) gastado += a.amount || 0;
      else if (a.type === 'raise') gastado += (a.amount != null ? a.amount : (a.to || 0));
    }
    hand.hero_net = Math.round((ganado + devuelto - gastado) * 100) / 100;
    hand.hero_net_bb = hand.bb > 0 ? Math.round((hand.hero_net / hand.bb) * 100) / 100 : 0;
    hand.hero_folded = hand.actions.some(a => a.type === 'fold' && a.player === hand.hero);
  }

  const collectors = hand.actions.filter(a => a.type === 'collect').map(a => a.player);
  if (new Set(collectors).size === 1) hand.winner = collectors[0];
  else if (!hand.winner && hand.hero && hand.hero_net > 0) hand.winner = hand.hero;

  hand.pot_total = Math.round(
    hand.actions.filter(a => a.type === 'collect' && a.pot !== 'summary').reduce((s,a) => s + a.amount, 0) * 100
  ) / 100 || Math.round(hand.actions.filter(a => a.type === 'collect').reduce((s,a) => s + a.amount, 0) * 100) / 100;

  return hand;
}

function parsePokerLog(text) {
  const sitio = detectarSitio(text);
  let hands = [];
  try {
    if (sitio === 'coinpoker') hands = parseCoinPokerLog(text);
    else if (sitio === 'pokerstars') hands = parsePokerStarsLog(text);
    else if (sitio === 'acr') hands = parseACRLog(text);
    else if (sitio === 'generic') hands = parseGenericLog(text);
    else {
      hands = parseACRLog(text);
      if (!hands.length) hands = parseCoinPokerLog(text);
      if (!hands.length) hands = parseGenericLog(text);
    }
  } catch (err) {
    console.warn('Error parseando:', err);
  }
  hands.forEach(h => { if (!h.site) h.site = sitio || 'generic'; });
  return hands;
}

/* ═══════════════════════════════════════════════════════
   NOMBRES BONITOS
   ═══════════════════════════════════════════════════════ */
const NOMBRES_POKER = [
  'ElTigre', 'LaSombra', 'RayoSilente', 'Cazador', 'EstrellaRoja',
  'ElFantasma', 'Trueno', 'AsDeCorazones', 'ReyDelNorte', 'LaReina',
  'Maverick', 'Nitro', 'Cobra', 'Tornado', 'Vikingo',
  'LoboEstepario', 'Puma', 'Zorro', 'Halcón', 'Jaguar',
  'Fuego', 'Diamante', 'Titan', 'Fénix', 'Relámpago',
  'ElCoyote', 'Pantera', 'Tiburón', 'Escorpión', 'Rinoceronte',
  'Aurora', 'Destello', 'Chispa', 'Relojero', 'Joker',
  'ElMago', 'Brujo', 'Alquimista', 'Explorador', 'Capitán',
  'Corsario', 'Nómada', 'Bucanero', 'Guardián', 'Vigía',
  'Samurái', 'Ninja', 'Maestro', 'Discípulo', 'Ermitaño',
  'Pirata', 'Duelista', 'Tirador', 'Francotirador', 'Sabueso',
  'Indomable', 'Salvaje', 'Feroz', 'Audaz', 'Intrépido',
  'Atlas', 'Hércules', 'Aquiles', 'Perseo', 'Apolo',
  'Cazafortunas', 'Corredor', 'Mensajero', 'Centinela', 'Navegante',
  'Astrónomo', 'Cartógrafo', 'Pionero', 'Artesano', 'Forjador',
  'Domador', 'Cetrero', 'Rastreador', 'Trotamundos', 'Errante',
  'Alba', 'Ocaso', 'Crepúsculo', 'Amanecer', 'Mediodía',
  'Invierno', 'Verano', 'Otoño', 'Primavera', 'Eclipse',
  'Cometa', 'Meteoro', 'Nebulosa', 'Galaxia', 'Universo'
];

function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function nombreBonito(original) {
  if (!original) return original;
  const esHash = /^[0-9a-f]{6,12}$/i.test(original);
  if (!esHash) return original;
  const h = hashString(original);
  return NOMBRES_POKER[h % NOMBRES_POKER.length];
}
let playerAliasMap = new Map();
function reconstruirAlias() {
  playerAliasMap = new Map();
  for (const m of manos) {
    if (!m.players) continue;
    for (const p of m.players) {
      if (!p.name) continue;
      if (p.name === 'Hero') continue;
      if (!playerAliasMap.has(p.name)) {
        playerAliasMap.set(p.name, nombreBonito(p.name));
      }
    }
  }
}
function aliasDe(nombre) {
  if (!nombre) return nombre;
  if (nombre === 'Hero') return 'Hero';
  if (!CONFIG.nombresBonitos) return nombre;
  if (playerAliasMap.has(nombre)) return playerAliasMap.get(nombre);
  return nombre;
}
function aliasMano(mano) {
  if (!mano) return mano;
  const alias = new Map();
  const getA = (n) => {
    if (!n) return n;
    if (n === 'Hero') return 'Hero';
    if (!CONFIG.nombresBonitos) return n;
    if (!alias.has(n)) alias.set(n, playerAliasMap.get(n) || nombreBonito(n));
    return alias.get(n);
  };
  return {
    ...mano,
    hero: getA(mano.hero),
    winner: mano.winner ? getA(mano.winner) : null,
    players: (mano.players||[]).map(p => ({ ...p, name: getA(p.name) })),
    actions: (mano.actions||[]).map(a => ({ ...a, player: getA(a.player) }))
  };
}

/* ═══════════════════════════════════════════════════════
   CÁLCULO DE ESTADÍSTICAS
   ═══════════════════════════════════════════════════════ */
function calcularEstadisticas(manos) {
  if (!manos.length) return {};

  const heroCount = {};
  for (const m of manos) {
    let h = m.hero;
    if (!h && m.actions && Array.isArray(m.actions)) {
      const deal = m.actions.find(a => a.type === 'deal_hole' && a.cards && a.cards.length);
      if (deal) h = deal.player;
    }
    if (h) heroCount[h] = (heroCount[h] || 0) + 1;
  }
  const heroEntries = Object.entries(heroCount).sort((a, b) => b[1] - a[1]);
  const primaryHero = heroEntries[0]?.[0] || null;
  if (!primaryHero) return {};

  const heroLabel = heroEntries.length > 1
    ? `${aliasDe(primaryHero)} +${heroEntries.length - 1}`
    : aliasDe(primaryHero);

  const stats = {
    hero: heroLabel,
    heroRaw: primaryHero,
    heroes: heroEntries.map(([n, c]) => ({ name: n, count: c })),
    manos_jugadas: 0, manos_totales: manos.length,
    vpip: 0, pfr: 0, three_bet: 0, three_bet_opp: 0, folds_preflop: 0,
    wins: 0, losses: 0, neto: 0, neto_bb: 0,
    por_posicion: {}, ultimas_ganancias: [],
    wtsd: 0, wtsd_opp: 0
  };

  for (const m of manos) {
    if (!m.actions || !Array.isArray(m.actions)) continue;

    let hero = m.hero;
    if (!hero) {
      const deal = m.actions.find(a => a.type === 'deal_hole' && a.cards && a.cards.length);
      if (deal) hero = deal.player;
    }
    if (!hero) continue;

    const heroPlayer = (m.players || []).find(p => p.name === hero);
    const accHero = m.actions.filter(a => a.player === hero);
    const hasDeal = accHero.some(a => a.type === 'deal_hole');
    const isSitOut = heroPlayer && (heroPlayer.sitting_out || heroPlayer.sittingOut || heroPlayer.waiting);
    if (isSitOut && !hasDeal && !accHero.length) continue;
    if (!hasDeal && !accHero.length) continue;
    stats.manos_jugadas++;

    const pos = getHeroPosicion(m) || '?';
    if (!stats.por_posicion[pos]) stats.por_posicion[pos] = { ganadas:0, perdidas:0, neto:0, neto_bb:0, manos:0 };
    stats.por_posicion[pos].manos++;

    const preActs = accHero.filter(a => a.street === 'preflop');
    const vpip = preActs.some(a => ['call','bet','raise','allin'].includes(a.type));
    const pfr = preActs.some(a => ['raise','allin'].includes(a.type));
    if (vpip) stats.vpip++;
    if (pfr) stats.pfr++;

    const preflop = m.actions.filter(a => a.street === 'preflop');
    let raiseSeen = false;
    for (const a of preflop) {
      if (['raise','allin'].includes(a.type) && a.player !== hero) {
        raiseSeen = true;
      } else if (raiseSeen && a.player === hero) {
        stats.three_bet_opp++;
        if (['raise','allin'].includes(a.type)) stats.three_bet++;
        break;
      }
    }
    if (accHero.some(a => a.type === 'fold' && a.street === 'preflop')) stats.folds_preflop++;

    const foldedPre = preActs.some(a => a.type === 'fold');
    const sawFlop = !foldedPre && ((m.board && m.board.length >= 3) ||
      accHero.some(a => ['flop','turn','river'].includes(a.street)));
    if (sawFlop) {
      stats.wtsd_opp++;
      if (m.hero_showdown || accHero.some(a => a.type === 'show')) stats.wtsd++;
    }

    const neto = m.hero_net || 0;
    const netoBB = m.hero_net_bb || 0;
    stats.neto += neto;
    stats.neto_bb += netoBB;
    stats.ultimas_ganancias.push(Math.round(netoBB * 100) / 100);
    const resCls = clasificarResultado(m);
    if (resCls === 'win') { stats.wins++; stats.por_posicion[pos].ganadas++; }
    else if (resCls === 'loss') { stats.losses++; stats.por_posicion[pos].perdidas++; }
    stats.por_posicion[pos].neto += neto;
    stats.por_posicion[pos].neto_bb += netoBB;
  }

  const total = stats.manos_jugadas || 1;
  stats.vpip_pct = Math.round(1000 * stats.vpip / total) / 10;
  stats.pfr_pct = Math.round(1000 * stats.pfr / total) / 10;
  stats.three_bet_pct = stats.three_bet_opp ? Math.round(1000 * stats.three_bet / stats.three_bet_opp) / 10 : 0;
  stats.wtsd_pct = stats.wtsd_opp ? Math.round(1000 * stats.wtsd / stats.wtsd_opp) / 10 : 0;
  stats.neto = Math.round(stats.neto * 100) / 100;
  stats.neto_bb = Math.round(stats.neto_bb * 100) / 100;
  for (const k in stats.por_posicion) {
    stats.por_posicion[k].neto = Math.round(stats.por_posicion[k].neto * 100) / 100;
    stats.por_posicion[k].neto_bb = Math.round(stats.por_posicion[k].neto_bb * 100) / 100;
  }
  stats.ultimas_ganancias = stats.ultimas_ganancias.slice(-20);
  return stats;
}

/* ═══════════════════════════════════════════════════════
   CONFIG & STATE
   ═══════════════════════════════════════════════════════ */
const DEFAULT_CONFIG = {
  unidad: 'bb', ocultarHastaShowdown: true, saltarAntes: true,
  autoSiguienteMano: false, sonidoActivo: true, velocidad: 750,
  filtroResultado: 'all', filtroAccion: 'all', filtroAcciones: [], filtroJugadas: [], filtroPosicion: '',
  filtroTorneo: '', filtroTorneos: [], listasTorneos: [], listaTorneoActiva: '',
  filtroSitio: '', filtroHeroes: [], busqueda: '', filtroBBMin: '', filtroBBMax: '',
  filtroFechaDesde: '', filtroFechaHasta: '',
  filtersOpen: (typeof window !== 'undefined' && window.innerWidth >= 960) ? false : true,
  sideOpen: true, sideTab: 'historial',
  nombresBonitos: true,
  cardScale: 1,
  playerFontScale: 1,
  potScale: 1,
  boardScale: 1,
  nameScale: 1
};

let CONFIG = { ...DEFAULT_CONFIG };
let manos = [], manosFiltradas = [], manoActual = 0, pasoActual = 0;
let timer = null, reproduciendo = false, statsActuales = null;
let favoritas = new Set();
let archivosCargados = [];
let notesDB = {};
let currentUser = null;

let _hlSuppressAutoScroll = false;

const $ = id => document.getElementById(id);
const tableScene = $('tableScene'), boardEl = $('board'), potEl = $('pot');
const logEl = $('logAcciones'), infoEl = $('info'), fileInfo = $('fileInfo');
const progressFill = $('progressFill'), handsList = $('handsList'), statsContainer = $('statsContainer');
const tableInfoBanner = $('tableInfoBanner');

function fmtDinero(v, bb) {
  if (CONFIG.unidad === 'bb') return (bb > 0 ? (v/bb).toFixed(2) : v.toFixed(2)) + ' BB';
  return v.toFixed(0);
}
function fmtStack(v, bb) {
  if (CONFIG.unidad === 'bb') return (v/bb).toFixed(1) + ' BB';
  return v.toFixed(0);
}
function fmtPot(v, bb) {
  if (CONFIG.unidad === 'bb') return (v/bb).toFixed(2) + ' BB';
  return v.toFixed(0);
}

let audioCtx = null;
function sonido(freq, dur, type='sine', vol=0.05) {
  if (!CONFIG.sonidoActivo) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + dur);
  } catch {}
}

/* ═══════════════════════════════════════════════════════
   LOCALSTORAGE
   ═══════════════════════════════════════════════════════ */
const LS_KEY = 'hl_config_v1';

function loadLocalConfig() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return (obj && typeof obj === 'object') ? obj : null;
  } catch (e) {
    console.warn('loadLocalConfig falló', e);
    return null;
  }
}

function saveLocalConfig() {
  try {
    const { busqueda, ...rest } = CONFIG;
    localStorage.setItem(LS_KEY, JSON.stringify(rest));
  } catch (e) {
    console.warn('saveLocalConfig falló', e);
  }
}

function applyVisualVars() {
  const root = document.body;
  root.style.setProperty('--hl-card-scale', String(CONFIG.cardScale || 1));
  root.style.setProperty('--hl-player-font-scale', String(CONFIG.playerFontScale || 1));
  root.style.setProperty('--hl-pot-scale', String(CONFIG.potScale || 1));
  root.style.setProperty('--hl-board-scale', String(CONFIG.boardScale || 1));
  root.style.setProperty('--hl-name-scale', String(CONFIG.nameScale || 1));
}

/* ═══════════════════════════════════════════════════════
   DB ADAPTER
   ═══════════════════════════════════════════════════════ */
const DB = {
  async handsCount() {
    try {
      const r = await FeltLabAPI.feltlab.countHands();
      return (r && r.count != null) ? r.count : manos.length;
    } catch {
      return manos.length;
    }
  },
  async allHands(opts) {
    const pageSize = 4000;
    const first = await FeltLabAPI.feltlab.listHands({ limit: pageSize, offset: 0, ...(opts || {}) });
    if (!Array.isArray(first) || first.length < pageSize) return first || [];
    const all = first.slice();
    let offset = pageSize;
    while (true) {
      const chunk = await FeltLabAPI.feltlab.listHands({ limit: pageSize, offset, ...(opts || {}) });
      if (!chunk || !chunk.length) break;
      all.push(...chunk);
      if (chunk.length < pageSize) break;
      offset += pageSize;
      await new Promise(r => setTimeout(r, 0));
    }
    return all;
  },
  async getHand(id) {
    return await FeltLabAPI.feltlab.getHand(id);
  },
  async putHands(list) {
    if (!list || !list.length) return 0;
    const batch = 400;
    let inserted = 0;
    for (let i = 0; i < list.length; i += batch) {
      const chunk = list.slice(i, i + batch);
      const r = await FeltLabAPI.feltlab.bulkHands(chunk);
      inserted += (r && r.inserted) || 0;
      if (i + batch < list.length) await new Promise(res => setTimeout(res, 0));
    }
    return inserted;
  },
  async clearHands() {
    return await FeltLabAPI.feltlab.clearHands();
  },
  async allNotes() {
    const notes = await FeltLabAPI.feltlab.listNotes();
    return notes.map(n => ({ id: n.hand_id, text: n.text, tags: n.tags, updated: n.updated_at }));
  },
  async putNote(n) {
    return await FeltLabAPI.feltlab.putNote(n.id, n.text || '', n.tags || []);
  },
  async deleteNote(id) {
    return await FeltLabAPI.feltlab.deleteNote(id);
  },
  async allFavorites() {
    const favs = await FeltLabAPI.feltlab.listFavs();
    return favs.map(id => ({ id }));
  },
  async putFavorite(id) {
    return await FeltLabAPI.feltlab.addFav(id);
  },
  async deleteFavorite(id) {
    return await FeltLabAPI.feltlab.removeFav(id);
  },
  async clearFavorites() {
    const favs = await this.allFavorites();
    for (const f of favs) await this.deleteFavorite(f.id);
  },
  async configGet() {
    return await FeltLabAPI.feltlab.getConfig();
  },
  async configSet(cfg) {
    return await FeltLabAPI.feltlab.setConfig(cfg);
  },
  async metaGet(k) {
    if (k === 'files') return await FeltLabAPI.feltlab.listFiles();
    return null;
  },
  async metaSet(k, v) {
    if (k === 'files') {
      for (const f of v) await FeltLabAPI.feltlab.putFile(f);
    }
  },
  async clearAll() {
    await FeltLabAPI.feltlab.clearHands();
  }
};

/* ═══════════════════════════════════════════════════════
   CARGA INICIAL
   ═══════════════════════════════════════════════════════ */
async function loadUser() {
  try {
    const me = await FeltLabAPI.auth.me();
    if (!me || !me.authenticated) {
      try {
        if (window.parent && window.parent !== window) {
          window.parent.location.href = '/login';
        } else {
          window.location.href = '/login';
        }
      } catch (_) {
        window.location.href = '/login';
      }
      return false;
    }
    currentUser = me.user;
    const un = document.getElementById('userName');
    if (un) un.textContent = me.user.display_name || me.user.username;
    const lu = document.getElementById('logoutUser');
    if (lu) lu.textContent = '@' + me.user.username;
    return true;
  } catch (e) {
    console.error('Error cargando usuario:', e);
    setConnStatus('offline', 'Offline');
    return false;
  }
}

async function pingServer() {
  try {
    const r = await FeltLabAPI.feltlab.countHands();
    if (r && typeof r.count === 'number') {
      setConnStatus('online', 'Online');
      return true;
    }
    setConnStatus('online', 'Online');
    return true;
  } catch (e) {
    console.warn('Ping servidor falló:', e);
    setConnStatus('offline', 'Offline');
    return false;
  }
}

async function cargarTodoDesdeDB() {
  setDbBusy(true);
  try {
    const alive = await pingServer();

    let hands = [], notes = [], favs = [], cfgMap = {};
    try {
      [hands, notes, favs, cfgMap] = await Promise.all([
        DB.allHands().catch(e => { console.error('allHands', e); return []; }),
        DB.allNotes().catch(e => { console.error('allNotes', e); return []; }),
        DB.allFavorites().catch(e => { console.error('allFavorites', e); return []; }),
        DB.configGet().catch(e => { console.error('configGet', e); return {}; })
      ]);
    } catch (e) {
      console.error('Promise.all DB:', e);
    }

    if (!Array.isArray(hands)) hands = [];
    if (!Array.isArray(notes)) notes = [];
    if (!Array.isArray(favs)) favs = [];
    if (!cfgMap || typeof cfgMap !== 'object') cfgMap = {};

    hands.sort((a,b) => {
      if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (parseInt(a.id)||0) - (parseInt(b.id)||0);
    });
    manos = hands;

    notesDB = {};
    notes.forEach(n => {
      if (!n) return;
      const id = n.id || n.hand_id;
      if (!id) return;
      let tags = n.tags || [];
      if (typeof tags === 'string') {
        try { tags = JSON.parse(tags); } catch { tags = []; }
      }
      if (!Array.isArray(tags)) tags = [];
      notesDB[id] = { text: n.text || '', tags, updated: n.updated || n.updated_at || 0 };
    });

    favoritas = new Set(favs.map(f => (typeof f === 'string' || typeof f === 'number') ? f : (f && f.id)).filter(Boolean));

    const localCfg = loadLocalConfig();
    if (localCfg) {
      CONFIG = { ...CONFIG, ...localCfg };
    }
    if (Object.keys(cfgMap).length) {
      CONFIG = { ...CONFIG, ...cfgMap, ...(localCfg || {}) };
      CONFIG.busqueda = '';
      CONFIG.sideOpen = true;
    } else if (!localCfg) {
      await DB.configSet({ ...CONFIG, busqueda: '' }).catch(()=>{});
    }
    if (!(CONFIG.cardScale > 0)) CONFIG.cardScale = 1;
    if (!(CONFIG.boardScale > 0)) CONFIG.boardScale = 1;
    if (!(CONFIG.playerFontScale > 0)) CONFIG.playerFontScale = 1;
    if (!(CONFIG.potScale > 0)) CONFIG.potScale = 1;
    if (!(CONFIG.nameScale > 0)) CONFIG.nameScale = 1;
    applyVisualVars();

    let filesMeta = null;
    try { filesMeta = await DB.metaGet('files'); } catch (e) { console.warn('metaGet files', e); }
    archivosCargados = Array.isArray(filesMeta) ? filesMeta : [];
    archivosCargados = archivosCargados.map(a => ({
      name: a.name,
      handsCount: a.handsCount || a.hands_count || 0,
      tournaments: new Set(Array.isArray(a.tournaments) ? a.tournaments : []),
      site: a.site || 'unknown'
    }));

    reconstruirAlias();
    aplicarFiltros();
    renderStats();
    renderHandsList({ scrollTop: true });
    renderFiltros();
    renderNotesList();
    actualizarSessionBadge();

    if (manosFiltradas.length) {
      cargarMano(manosFiltradas[0].idx, { suppressScroll: true });
    } else {
      if (infoEl) infoEl.textContent = '';
      actualizarBanner();
    }

    if (alive) setConnStatus('online', 'Online');
  } catch (e) {
    console.error('Error cargando DB:', e);
    try {
      const el = document.getElementById('connIndicator');
      if (!el || !el.classList.contains('online')) {
        setConnStatus('offline', 'Offline');
        showToast('Error de conexión con el servidor', 'error');
      } else {
        showToast('Algunos datos no se pudieron cargar', 'error');
      }
    } catch (_) {
      setConnStatus('offline', 'Offline');
    }
  } finally {
    setDbBusy(false);
  }
}

function setDbBusy(b) {
  const btn = $('btnOpenOptions');
  if (btn) btn.classList.toggle('db-busy', b);
}

/* ═══════════════════════════════════════════════════════
   TABS / SIDE
   ═══════════════════════════════════════════════════════ */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('active')) return;
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.body.dataset.tab = tab;
    requestAnimationFrame(() => {
      if (tab === 'historial' && window._hlDirtyList) {
        renderHandsList({ scrollTop: true });
        window._hlDirtyList = false;
      }
      if (tab === 'stats' && window._hlDirtyStats) {
        renderStats();
        window._hlDirtyStats = false;
      }
      if (tab === 'notes' && window._hlDirtyNotes) {
        renderNotesList();
        window._hlDirtyNotes = false;
      }
    });
  });
});

function aplicarSidePanel() {
  const layout = $('layout'), colSide = $('colSide');
  if (!layout || !colSide) return;
  CONFIG.sideOpen = true;
  layout.classList.remove('side-collapsed');
  const tab = CONFIG.sideTab || 'historial';
  colSide.dataset.side = tab;
  colSide.querySelectorAll('.side-tab').forEach(b => b.classList.toggle('active', b.dataset.side === tab));
  if (tab === 'historial') {
    if (window._hlDirtyList !== false) renderHandsList({ scrollTop: true });
    window._hlDirtyList = false;
  } else if (tab === 'stats') {
    renderStats();
    window._hlDirtyStats = false;
  } else if (tab === 'notes') {
    renderNotesList();
    window._hlDirtyNotes = false;
  }
}
document.querySelectorAll('.side-tab').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    CONFIG.sideTab = btn.dataset.side || 'historial';
    CONFIG.sideOpen = true;
    try { saveConfig(); } catch (_) {}
    aplicarSidePanel();
  });
});
aplicarSidePanel();

/* ═══════════════════════════════════════════════════════
   MENÚ LATERAL
   ═══════════════════════════════════════════════════════ */
function openMenu() {
  $('sideMenu')?.classList.add('open');
  $('sideMenuOverlay')?.classList.add('open');
}
function closeMenu() {
  $('sideMenu')?.classList.remove('open');
  $('sideMenuOverlay')?.classList.remove('open');
}
$('btnOpenMenu')?.addEventListener('click', openMenu);
$('btnCloseMenu')?.addEventListener('click', closeMenu);
$('sideMenuOverlay')?.addEventListener('click', closeMenu);
$('menuBackPortal')?.addEventListener('click', () => { window.location.href = '/'; });

$('btnOpenOptions')?.addEventListener('click', () => {
  closeMenu();
  renderSettings();
  openModal('settingsModal');
});

$('menuImport')?.addEventListener('click', () => { closeMenu(); openModal('importModal'); descubrirLogsServidor(true); });
$('menuExport')?.addEventListener('click', () => {
  closeMenu();
  const fecha = new Date().toISOString().slice(0, 10);
  const parts = ['feltlab'];
  if (CONFIG.filtroSitio) parts.push(CONFIG.filtroSitio);
  if (CONFIG.filtroPosicion) parts.push(CONFIG.filtroPosicion);
  const accList = Array.isArray(CONFIG.filtroAcciones) ? CONFIG.filtroAcciones : [];
  if (accList.length) parts.push(accList.join('-'));
  else if (CONFIG.filtroAccion && CONFIG.filtroAccion !== 'all') parts.push(CONFIG.filtroAccion);
  if ((CONFIG.busqueda || '').trim()) parts.push(CONFIG.busqueda.trim().replace(/\s+/g, ''));
  parts.push(fecha);
  const defName = parts.join('-').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ.]+/g, '_');
  openModal('exportModal');
  setTimeout(() => {
    const inp = $('exportFileName');
    if (inp) { inp.value = defName; inp.focus(); }
  }, 50);
});
$('menuLibrary')?.addEventListener('click', () => { closeMenu(); openModal('libraryModal'); refreshLibraryList(); });
$('menuHelp')?.addEventListener('click', () => { closeMenu(); openModal('helpModal'); });
$('menuCredits')?.addEventListener('click', () => { closeMenu(); openModal('creditsModal'); });
$('menuSettings')?.addEventListener('click', () => { closeMenu(); renderSettings(); openModal('settingsModal'); });
$('menuLogout')?.addEventListener('click', () => { closeMenu(); doLogout(); });

/* ═══════════════════════════════════════════════════════
   TOOL VIEWER
   ═══════════════════════════════════════════════════════ */
const toolViewer = $('toolViewer');
const toolViewerFrame = $('toolViewerFrame');
const toolViewerTitle = $('toolViewerTitle');
const toolViewerIcon = $('toolViewerIcon');
const toolViewerLoader = $('toolViewerLoader');
let currentToolKey = null;

function openTool(toolKey) {
  const tool = TOOLS_MAP[toolKey];
  if (!tool) return;
  closeMenu();
  currentToolKey = toolKey;
  if (toolViewerTitle) toolViewerTitle.textContent = tool.title;
  if (toolViewerIcon) toolViewerIcon.textContent = tool.icon;
  const actions = toolViewer && toolViewer.querySelector('.tool-viewer-actions');
  if (actions) actions.style.display = 'flex';
  toolViewer.classList.add('open');
  document.body.style.overflow = 'hidden';
  if (toolViewerLoader) toolViewerLoader.classList.remove('hide');
  toolViewerFrame.src = 'about:blank';
  setTimeout(() => {
    const sep = tool.url.includes('?') ? '&' : '?';
    toolViewerFrame.src = tool.url + sep + 'embed=1&_=' + Date.now();
  }, 40);
}

function closeTool() {
  toolViewer.classList.remove('open');
  document.body.style.overflow = '';
  setTimeout(() => {
    toolViewerFrame.src = 'about:blank';
    currentToolKey = null;
  }, 350);
}

function reloadTool() {
  if (!currentToolKey) return;
  const tool = TOOLS_MAP[currentToolKey];
  if (!tool) return;
  if (toolViewerLoader) toolViewerLoader.classList.remove('hide');
  toolViewerFrame.src = 'about:blank';
  setTimeout(() => {
    const sep = tool.url.includes('?') ? '&' : '?';
    toolViewerFrame.src = tool.url + sep + 'embed=1&_=' + Date.now();
  }, 50);
}

function openToolInNewTab() {
  if (!currentToolKey) return;
  const tool = TOOLS_MAP[currentToolKey];
  if (tool) window.open(tool.url, '_blank', 'noopener');
}

toolViewerFrame.addEventListener('load', () => {
  if (toolViewerFrame.src && toolViewerFrame.src !== 'about:blank') {
    setTimeout(() => {
      if (toolViewerLoader) toolViewerLoader.classList.add('hide');
    }, 280);
  }
});

$('toolViewerBack').addEventListener('click', closeTool);
$('toolViewerRefresh').addEventListener('click', reloadTool);
$('toolViewerOpenNew').addEventListener('click', openToolInNewTab);

document.querySelectorAll('[data-open-tool]').forEach(btn => {
  btn.addEventListener('click', () => openTool(btn.dataset.openTool));
});

window.addEventListener('message', (e) => {
  if (e && e.data && e.data.type === 'feltlab-close-tool') {
    closeTool();
  }
});

/* ═══════════════════════════════════════════════════════
   DROPZONE
   ═══════════════════════════════════════════════════════ */
function bindDropzone() {
  const dz = $('dropzone');
  const fi = $('fileInput');
  const di = $('dirInput');
  if (!dz || !fi || !di) return;

  dz.onclick = e => { if (e.target.closest('button')) return; fi.click(); };
  $('btnPickFiles').onclick = e => { e.stopPropagation(); fi.click(); };
  $('btnPickFolder').onclick = e => { e.stopPropagation(); di.click(); };

  dz.ondragover = e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('dragover'); };
  dz.ondragleave = e => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('dragover'); };
  dz.ondrop = async e => {
    e.preventDefault();
    e.stopPropagation();
    dz.classList.remove('dragover');

    const info = $('fileInfo');
    if (info) { info.classList.remove('error'); info.style.color = 'var(--green)'; info.textContent = '⏳ Analizando lo que soltaste...'; }

    let archivos = [];
    try {
      const items = [...(e.dataTransfer.items || [])];
      const entries = [];
      for (const it of items) {
        if (it.kind !== 'file') continue;
        const entry = it.webkitGetAsEntry ? it.webkitGetAsEntry() : null;
        if (entry) entries.push(entry);
      }
      if (entries.length) {
        for (const en of entries) await recorrerEntrySafe(en, archivos);
      }
    } catch (err) {
      console.warn('webkitGetAsEntry falló:', err);
      archivos = [];
    }

    if (!archivos.length && e.dataTransfer.files && e.dataTransfer.files.length) {
      archivos = [...e.dataTransfer.files];
    }

    const validos = archivos.filter(f => esArchivoDeLogs(f));
    if (!validos.length) {
      if (info) {
        info.classList.add('error');
        info.textContent = `❌ No se encontraron .txt ni .log (recibidos: ${archivos.length})`;
      }
      return;
    }

    await leerArchivos(validos);
  };

  fi.onchange = () => { if (fi.files && fi.files.length) leerArchivos([...fi.files]); fi.value = ''; };
  di.onchange = () => { if (di.files && di.files.length) leerArchivos([...di.files]); di.value = ''; };
}

function esArchivoDeLogs(f) {
  if (!f) return false;
  const name = (f.name || '').toLowerCase();
  if (name.endsWith('.txt') || name.endsWith('.log')) return true;
  if (f.type === 'text/plain' || f.type === '') return true;
  return false;
}

function recorrerEntrySafe(entry, out, depth = 0) {
  return new Promise(resolve => {
    if (!entry) return resolve();
    if (depth > 20) return resolve();

    if (entry.isFile) {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      try {
        entry.file(
          f => { try { out.push(f); } catch (err) {} finish(); },
          () => finish()
        );
      } catch (err) { finish(); }
      setTimeout(finish, 1500);
    } else if (entry.isDirectory) {
      let reader;
      try { reader = entry.createReader(); } catch (err) { return resolve(); }
      const leerBatch = () => {
        try {
          reader.readEntries(async ents => {
            try {
              if (!ents.length) return resolve();
              for (const e of ents) await recorrerEntrySafe(e, out, depth + 1);
              leerBatch();
            } catch (err) { resolve(); }
          }, () => resolve());
        } catch (err) { resolve(); }
      };
      leerBatch();
    } else resolve();
  });
}
bindDropzone();

/* ═══════════════════════════════════════════════════════
   IMPORT TABS
   ═══════════════════════════════════════════════════════ */
document.querySelectorAll('[data-import-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.importTab;
    document.querySelectorAll('[data-import-tab]').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.hl-tab-panel').forEach(p => p.classList.remove('active'));
    if (tab === 'logs') $('importPanelLogs').classList.add('active');
    else $('importPanelJson').classList.add('active');
  });
});

/* ═══════════════════════════════════════════════════════
   SESSION BADGE
   ═══════════════════════════════════════════════════════ */
function actualizarSessionBadge() {
  const el = $('sessionBadge');
  if (!el) return;
  const n = manos.length;
  const f = manosFiltradas.length;
  if (!n) {
    el.innerHTML = '<span class="sb-line">0 manos</span>';
    el.classList.remove('has-hands');
    return;
  }
  el.classList.add('has-hands');
  const isFiltered = f !== n;
  el.innerHTML =
    `<span class="sb-line">${n} manos</span>` +
    (isFiltered ? `<span class="sb-line sb-filtered">${f} filtradas</span>` : '');
}

function leerTexto(file) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, v) => { if (!done) { done = true; fn(v); } };
    try {
      const r = new FileReader();
      r.onload = e => finish(resolve, e.target.result);
      r.onerror = () => finish(reject, new Error(`No se pudo leer "${file.name}"`));
      r.onabort = () => finish(reject, new Error(`Lectura abortada en "${file.name}"`));
      setTimeout(() => finish(reject, new Error(`Timeout leyendo "${file.name}"`)), 30000);
      r.readAsText(file, 'UTF-8');
    } catch (err) { finish(reject, err); }
  });
}

function extraerNombreTorneoDeArchivo(nombreArchivo) {
  if (!nombreArchivo) return null;
  const m = nombreArchivo.match(/\bTN-([^\n]+?)\s+(?:GAMETYPE-|LIMIT-|CUR-|OND-|BUYIN-|$)/i);
  if (m && m[1]) return m[1].trim();
  const m2 = nombreArchivo.match(/\bTN-([^.]*?)(?:\.|$)/i);
  if (m2 && m2[1]) return m2[1].trim().replace(/\s+GAMETYPE.*$/, '').trim();
  return null;
}

/* ═══════════════════════════════════════════════════════
   LECTURA + AGRUPACIÓN + PICKER
   ═══════════════════════════════════════════════════════ */
let pendingImport = null;

async function leerArchivos(files) {
  const info = $('fileInfo');

  files = files.map(f => {
    const base = (f.name || '').split('/').pop().split('\\').pop();
    if (base && base !== f.name) {
      try { Object.defineProperty(f, 'name', { value: base, configurable: true }); } catch {}
    }
    return f;
  });

  const validos = files.filter(esArchivoDeLogs);
  if (!validos.length) {
    if (info) { info.classList.add('error'); info.textContent = '❌ Solo .txt o .log'; }
    return;
  }

  if (info) {
    info.classList.remove('error');
    info.style.color = 'var(--green)';
    info.textContent = `⏳ Procesando ${validos.length} archivo(s)...`;
  }

  const resultados = [];
  let procesados = 0;
  for (const file of validos) {
    procesados++;
    if (info) info.textContent = `⏳ Leyendo ${procesados}/${validos.length} · ${file.name}`;
    try {
      const text = await leerTexto(file);
      let hands = [];
      try { hands = parsePokerLog(text); } catch (err) { console.warn('parse falló:', err); }
      hands.forEach(h => {
        h.sourceFile = file.name;
        if (h.site === 'acr' && (!h.tournamentName || h.tournamentName.startsWith('Torneo '))) {
          const tn = extraerNombreTorneoDeArchivo(file.name);
          if (tn) h.tournamentName = tn;
        }
      });
      resultados.push({ name: file.name, hands, error: null });
    } catch (err) {
      resultados.push({ name: file.name, hands: [], error: err.message || 'Error de lectura' });
    }
  }

  const todasLasManos = [];
  const errores = [];
  for (const r of resultados) {
    if (r.error) { errores.push(`"${r.name}": ${r.error}`); continue; }
    if (!r.hands.length) { errores.push(`"${r.name}": sin manos válidas`); continue; }
    todasLasManos.push(...r.hands);
  }

  if (!todasLasManos.length) {
    if (info) {
      info.classList.add('error');
      info.textContent = `❌ 0 manos cargadas · ${errores.length} archivo(s) con problemas`;
    }
    return;
  }

  const grupos = new Map();
  for (const h of todasLasManos) {
    const key = h.tournament
      ? `${h.site}::${h.tournament}`
      : `${h.site}::_cash_::${h.sourceFile || 'sin-archivo'}`;
    if (!grupos.has(key)) {
      grupos.set(key, {
        key,
        site: h.site,
        tournamentId: h.tournament || null,
        tournamentName: h.tournamentName || (h.tournament ? `Torneo ${h.tournament}` : 'Sin torneo'),
        hands: [],
        earliest: h.date || '',
        files: new Set()
      });
    }
    const g = grupos.get(key);
    g.hands.push(h);
    if (h.sourceFile) g.files.add(h.sourceFile);
    if (h.date && (!g.earliest || h.date < g.earliest)) g.earliest = h.date;
  }

  if (grupos.size > 1) {
    pendingImport = { grupos, resultados, errores, totalManos: todasLasManos.length };
    mostrarTournamentPicker(grupos);
    if (info) info.textContent = `⏳ ${grupos.size} torneos detectados, elige cuáles importar...`;
    return;
  }

  await importarGrupos([...grupos.values()], resultados, errores);
}

/* ═══════════════════════════════════════════════════════
   TOURNAMENT PICKER
   ═══════════════════════════════════════════════════════ */
function mostrarTournamentPicker(grupos) {
  const list = $('tournamentList');
  if (!list) return;
  const seleccionados = new Set(grupos.keys());

  const render = () => {
    list.innerHTML = '';
    const arr = [...grupos.values()].sort((a,b) => {
      const an = a.tournamentName || a.tournamentId || '';
      const bn = b.tournamentName || b.tournamentId || '';
      return an.localeCompare(bn);
    });
    for (const g of arr) {
      const el = document.createElement('div');
      el.className = 'tournoi-item' + (seleccionados.has(g.key) ? ' selected' : '');
      const name = g.tournamentName || 'Sin torneo';
      const tId = g.tournamentId ? `T#${g.tournamentId}` : '—';
      const files = [...g.files].join(', ');
      el.innerHTML = `
        <div class="ti-check">✓</div>
        <div class="ti-main">
          <div class="ti-name">${escapeHtml(name)}</div>
          <div class="ti-meta">
            <span>${tId}</span>
            <span>${g.hands.length} manos</span>
            <span>${escapeHtml(files.slice(0, 40))}${files.length > 40 ? '…' : ''}</span>
          </div>
        </div>
        <span class="ti-site">${g.site}</span>
      `;
      el.addEventListener('click', () => {
        if (seleccionados.has(g.key)) seleccionados.delete(g.key);
        else seleccionados.add(g.key);
        render();
      });
      list.appendChild(el);
    }
    const totalSeleccion = [...seleccionados].reduce((s, k) => s + (grupos.get(k)?.hands.length || 0), 0);
    const sum = $('tournamentSummary');
    if (sum) sum.textContent = `${seleccionados.size} de ${grupos.size} torneos · ${totalSeleccion} manos a importar`;
  };

  $('btnTSelectAll').onclick = () => { seleccionados.clear(); grupos.forEach((_,k) => seleccionados.add(k)); render(); };
  $('btnTSelectNone').onclick = () => { seleccionados.clear(); render(); };
  $('btnTInvert').onclick = () => {
    const nuevos = new Set();
    for (const k of grupos.keys()) if (!seleccionados.has(k)) nuevos.add(k);
    seleccionados.clear();
    nuevos.forEach(k => seleccionados.add(k));
    render();
  };

  $('btnTImport').onclick = async () => {
    const sel = [...seleccionados].map(k => grupos.get(k)).filter(Boolean);
    if (!sel.length) { showToast('Selecciona al menos un torneo', 'error'); return; }
    closeModal('tournamentModal');
    const info = $('fileInfo');
    if (info) info.textContent = `⏳ Importando ${sel.length} torneo(s)...`;
    await importarGrupos(sel, pendingImport.resultados, pendingImport.errores);
    pendingImport = null;
  };

  $('btnTCancel').onclick = () => {
    closeModal('tournamentModal');
    pendingImport = null;
    const info = $('fileInfo');
    if (info) info.textContent = '⚠️ Importación cancelada';
  };

  render();
  openModal('tournamentModal');
}

/* ═══════════════════════════════════════════════════════
   IMPORTAR GRUPOS
   ═══════════════════════════════════════════════════════ */
async function importarGrupos(grupos, resultados, erroresPrevios) {
  const info = $('fileInfo');
  const errores = [...(erroresPrevios || [])];

  const aInsertar = [];
  const porGrupo = [];
  for (const g of grupos) {
    if (!g.hands.length) { errores.push(`"${g.tournamentName}": sin manos`); continue; }
    aInsertar.push(...g.hands);
    porGrupo.push({ name: g.tournamentName || g.key, n: g.hands.length, site: g.site, tournament: g.tournamentId });
  }

  const existentes = new Set(manos.map(m => m.id));
  const nuevos = aInsertar.filter(h => !existentes.has(h.id));

  if (info) info.textContent = `⏳ Guardando ${nuevos.length} manos nuevas...`;

  let inserted = 0;
  try {
    inserted = await DB.putHands(nuevos);
  } catch (err) {
    if (info) {
      info.classList.add('error');
      info.textContent = `❌ Error guardando: ${err.message}`;
    }
    return;
  }

  const setArchivos = new Map(archivosCargados.map(a => [a.name, a]));
  for (const g of grupos) {
    const name = g.tournamentName || 'Sin torneo';
    const prev = setArchivos.get(name) || { name, handsCount: 0, tournaments: new Set(), site: g.site };
    const handsDeEste = nuevos.filter(h =>
      (g.tournamentId ? h.tournament === g.tournamentId : !h.tournament) &&
      h.site === g.site
    );
    prev.handsCount += handsDeEste.length;
    if (g.tournamentId) prev.tournaments.add(g.tournamentId);
    prev.site = g.site;
    setArchivos.set(name, prev);
  }
  archivosCargados = [...setArchivos.values()];
  await DB.metaSet('files', archivosCargados.map(a => ({
    name: a.name, handsCount: a.handsCount,
    tournaments: [...a.tournaments], site: a.site
  })));

  await cargarTodoDesdeDB();

  let txt = `✅ ${porGrupo.length} torneo(s) OK · ${manos.length} manos`;
  if (inserted) txt += ` (+${inserted} nuevas)`;
  if (errores.length) txt += ` · ⚠ ${errores.length} con problemas`;

  if (info) {
    if (errores.length) {
      info.classList.remove('error');
      info.style.color = 'var(--amber)';
    } else {
      info.classList.remove('error');
      info.style.color = 'var(--green)';
    }
    info.textContent = txt;
  }
  showToast(`Importadas ${inserted} manos ✓`, 'success');
}

/* ═══════════════════════════════════════════════════════
   POSICIÓN
   ═══════════════════════════════════════════════════════ */
function etiquetaPosicion(relIdx, n) {
  if (n <= 1) return 'BTN';
  if (n === 2) return relIdx === 0 ? 'BTN' : 'BB';
  if (relIdx === 0) return 'BTN';
  if (relIdx === 1) return 'SB';
  if (relIdx === 2) return 'BB';
  if (relIdx === n - 1 && n >= 4) return 'CO';
  const early = relIdx - 3;
  if (n <= 6) return early === 0 ? 'UTG' : 'HJ';
  if (early === 0) return 'UTG';
  if (early === 1) return 'UTG+1';
  if (early === 2) return 'MP';
  if (early === 3) return 'LJ';
  return 'HJ';
}
function getHeroPosicion(mano) {
  if (!mano?.hero || !mano.players?.length) return null;
  let players = [...mano.players].filter(p => !p.waiting);
  const btnSeat = mano.button != null ? Number(mano.button) : null;
  if (btnSeat != null && !players.some(p => Number(p.seat) === btnSeat)) {
    players.push({ seat: btnSeat, name: 'BTN', stack: 0, waiting: true, isGhost: true });
  }
  players.sort((a,b) => a.seat - b.seat);
  const n = players.length; if (!n) return null;
  let btnIdx = 0;
  if (btnSeat != null) { const bi = players.findIndex(p => Number(p.seat) === btnSeat); if (bi >= 0) btnIdx = bi; }
  const heroIdx = players.findIndex(p => p.name === mano.hero);
  if (heroIdx < 0) return null;
  return etiquetaPosicion((heroIdx - btnIdx + n) % n, n);
}

/* ═══════════════════════════════════════════════════════
   RESULTADO DE MANO
   ═══════════════════════════════════════════════════════ */
function heroTieneAccionVoluntaria(m) {
  if (!m || !m.hero || !Array.isArray(m.actions)) return false;
  return m.actions.some(a =>
    a.player === m.hero && ['call', 'bet', 'raise', 'allin'].includes(a.type)
  );
}

function clasificarResultado(m) {
  if (!heroTieneAccionVoluntaria(m)) return 'neutral';
  const net = m.hero_net || 0;
  if (net > 0) return 'win';
  if (net < 0) return 'loss';
  return 'neutral';
}

/* ═══════════════════════════════════════════════════════
   DETECTORES DE JUGADAS (hero / vs hero)
   ═══════════════════════════════════════════════════════ */
function getHeroFromHand(m) {
  if (!m) return null;
  if (m.hero) return m.hero;
  if (!Array.isArray(m.actions)) return null;
  const deal = m.actions.find(a => a.type === 'deal_hole' && a.cards && a.cards.length);
  return deal ? deal.player : null;
}

function isRaiseLike(a) {
  return a && (a.type === 'raise' || a.type === 'allin');
}
function isBetOrRaise(a) {
  return a && (a.type === 'bet' || a.type === 'raise' || a.type === 'allin');
}
function isHeroResponse(a) {
  return a && ['fold', 'call', 'raise', 'allin', 'bet'].includes(a.type);
}

/** Último agresor preflop (última raise/all-in). */
function lastPreflopRaiser(m) {
  if (!m || !Array.isArray(m.actions)) return null;
  let last = null;
  for (const a of m.actions) {
    if (a.street === 'preflop' && isRaiseLike(a)) last = a.player;
  }
  return last;
}

/**
 * Detecta si la mano cumple una jugada concreta del / contra el hero.
 * Keys: '3bet' | 'vs3bet' | 'cbet' | 'vscbet' | 'allin' | 'vsallin'
 */
function manoTieneJugada(m, key) {
  const hero = getHeroFromHand(m);
  if (!hero || !Array.isArray(m.actions) || !m.actions.length) return false;
  const acts = m.actions;

  if (key === '3bet') {
    // Hero 3-betea preflop: al menos una raise previa de otro, luego raise/all-in del hero
    const pre = acts.filter(a => a.street === 'preflop');
    let raiseCount = 0;
    for (const a of pre) {
      if (!isRaiseLike(a)) continue;
      raiseCount++;
      if (raiseCount >= 2 && a.player === hero) return true;
    }
    return false;
  }

  if (key === 'vs3bet') {
    // Hero enfrenta un 3-bet preflop: alguien raise, otro 3-betea (no hero), hero responde
    const pre = acts.filter(a => a.street === 'preflop');
    let raiseCount = 0;
    let faced3bet = false;
    for (const a of pre) {
      if (isRaiseLike(a)) {
        raiseCount++;
        if (raiseCount >= 2 && a.player !== hero) {
          faced3bet = true;
          continue;
        }
      }
      if (faced3bet && a.player === hero && isHeroResponse(a)) return true;
    }
    return false;
  }

  if (key === 'cbet') {
    // Hero fue agresor preflop y apuesta (o all-in) en el flop
    if (lastPreflopRaiser(m) !== hero) return false;
    return acts.some(a =>
      a.street === 'flop' && a.player === hero && (a.type === 'bet' || a.type === 'allin')
    );
  }

  if (key === 'vscbet') {
    // Oponente fue PFR, c-betea flop, hero responde
    const pfr = lastPreflopRaiser(m);
    if (!pfr || pfr === hero) return false;
    let faced = false;
    for (const a of acts) {
      if (a.street !== 'flop') continue;
      if ((a.type === 'bet' || a.type === 'allin') && a.player === pfr) {
        faced = true;
      } else if (faced && a.player === hero && isHeroResponse(a)) {
        return true;
      }
    }
    return false;
  }

  if (key === 'allin') {
    return acts.some(a => a.player === hero && a.type === 'allin');
  }

  if (key === 'vsallin') {
    // Oponente se va all-in y el hero responde (fold/call/raise/allin)
    let faced = false;
    for (const a of acts) {
      if (a.type === 'allin' && a.player !== hero) {
        faced = true;
      } else if (faced && a.player === hero && isHeroResponse(a)) {
        return true;
      }
    }
    return false;
  }

  return false;
}

function manoCoincideJugadas(m, keys) {
  if (!keys || !keys.length) return true;
  // OR: cumple al menos una de las jugadas marcadas
  return keys.some(k => manoTieneJugada(m, k));
}

/* ═══════════════════════════════════════════════════════
   FILTROS
   ═══════════════════════════════════════════════════════ */
function normalizarRangoToken(t) {
  return String(t || '').toUpperCase().replace(/10/g, 'T').replace(/\s+/g, '');
}
function parsearRangoCartas(texto) {
  if (!texto) return [];
  const tokens = texto.toUpperCase().split(/[\s,;]+/).filter(Boolean).map(normalizarRangoToken);
  const rango = [], orden = '23456789TJQKA';
  const idx = r => orden.indexOf(r);

  function addCombo(r1, r2, tipo) {
    let a = r1, b = r2;
    if (idx(a) < idx(b)) [a, b] = [b, a];
    const t = a === b ? 'pair' : tipo;
    rango.push({ r1: a, r2: b, tipo: t });
  }

  for (const t of tokens) {
    // Rango con guión: A2-A9, A2s-A9s, A2o-A9o, 22-99, ATs-AKs, etc.
    let m = t.match(/^([2-9TJQKA])([2-9TJQKA])([SO]?)\-([2-9TJQKA])([2-9TJQKA])([SO]?)$/);
    if (m) {
      let [, a1, a2, asuf, b1, b2, bsuf] = m;
      // Normalizar: high card first in each pair
      if (idx(a1) < idx(a2)) [a1, a2] = [a2, a1];
      if (idx(b1) < idx(b2)) [b1, b2] = [b2, b1];
      // Mismo high rank (p.ej. A2-A9): variar el kicker
      if (a1 === b1 && a1 !== a2) {
        const lo = Math.min(idx(a2), idx(b2));
        const hi = Math.max(idx(a2), idx(b2));
        const suf = asuf || bsuf || '';
        const tipo = suf === 'S' ? 'suited' : (suf === 'O' ? 'offsuit' : 'any');
        for (let i = lo; i <= hi; i++) {
          if (orden[i] === a1) continue; // skip pairs in this branch
          addCombo(a1, orden[i], tipo);
        }
        continue;
      }
      // Pares: 22-99
      if (a1 === a2 && b1 === b2) {
        const lo = Math.min(idx(a1), idx(b1));
        const hi = Math.max(idx(a1), idx(b1));
        for (let i = lo; i <= hi; i++) addCombo(orden[i], orden[i], 'pair');
        continue;
      }
      // Fallback: tratar extremos como combos individuales
      const sufA = asuf || '';
      const sufB = bsuf || '';
      addCombo(a1, a2, sufA === 'S' ? 'suited' : (sufA === 'O' ? 'offsuit' : 'any'));
      addCombo(b1, b2, sufB === 'S' ? 'suited' : (sufB === 'O' ? 'offsuit' : 'any'));
      continue;
    }

    // Notación corta de rango mismo high: A2-9, A2s-9s, A2o-9o
    m = t.match(/^([2-9TJQKA])([2-9TJQKA])([SO]?)\-([2-9TJQKA])([SO]?)$/);
    if (m) {
      let [, high, low1, suf1, low2, suf2] = m;
      const suf = suf1 || suf2 || '';
      const tipo = suf === 'S' ? 'suited' : (suf === 'O' ? 'offsuit' : 'any');
      const lo = Math.min(idx(low1), idx(low2));
      const hi = Math.max(idx(low1), idx(low2));
      for (let i = lo; i <= hi; i++) {
        if (orden[i] === high) continue;
        addCombo(high, orden[i], tipo);
      }
      continue;
    }

    // Plus: ATs+, 99+, AJo+
    m = t.match(/^([2-9TJQKA])([2-9TJQKA])([SO]?)\+$/);
    if (m) {
      let [, c1, c2, suf] = m;
      if (c1 === c2) {
        // pares desde ese rank hacia arriba
        for (let i = idx(c1); i < orden.length; i++) addCombo(orden[i], orden[i], 'pair');
      } else {
        // mismo high, kicker desde c2 hacia high-1
        if (idx(c1) < idx(c2)) [c1, c2] = [c2, c1];
        const tipo = suf === 'S' ? 'suited' : (suf === 'O' ? 'offsuit' : 'any');
        for (let i = idx(c2); i < idx(c1); i++) addCombo(c1, orden[i], tipo);
      }
      continue;
    }

    // Combo simple: AA, AKo, AKs, 9Js
    m = t.match(/^([2-9TJQKA])([2-9TJQKA])([SO]?)$/);
    if (m) {
      let [, c1, c2, suf] = m;
      const tipo = c1 === c2 ? 'pair' : (suf === 'S' ? 'suited' : (suf === 'O' ? 'offsuit' : 'any'));
      addCombo(c1, c2, tipo);
    }
  }
  return rango;
}
function rankDeCarta(c) {
  if (!c) return '';
  let s = String(c).trim();
  s = s.replace(/\s+/g, '');
  let rank = s.slice(0, -1).toUpperCase();
  if (rank === '10') rank = 'T';
  if (!rank && s.length) rank = s.toUpperCase().replace(/10/g, 'T');
  return rank;
}
function paloDeCarta(c) {
  if (!c) return '';
  const s = String(c).trim().replace(/\s+/g, '');
  const last = s.slice(-1).toLowerCase();
  if ('h♥♡'.includes(last)) return 'h';
  if ('d♦♢'.includes(last)) return 'd';
  if ('c♣♧'.includes(last)) return 'c';
  if ('s♠♤'.includes(last)) return 's';
  return last;
}
function manoCoincideConRango(heroCards, patron) {
  if (!heroCards || heroCards.length < 2) return false;
  let a = rankDeCarta(heroCards[0]);
  let b = rankDeCarta(heroCards[1]);
  const orden = '23456789TJQKA';
  if (orden.indexOf(a) < 0 || orden.indexOf(b) < 0) return false;
  if (orden.indexOf(a) < orden.indexOf(b)) [a, b] = [b, a];
  if (patron.tipo === 'pair') return a === b && a === patron.r1;
  if (a !== patron.r1 || b !== patron.r2) return false;
  const suited = paloDeCarta(heroCards[0]) === paloDeCarta(heroCards[1]);
  if (patron.tipo === 'suited') return suited;
  if (patron.tipo === 'offsuit') return !suited;
  return true;
}
function textoLibreCoincide(m, q) {
  if (!q) return true;
  const ql = q.toLowerCase();
  const partes = [
    m.id, m.hero, m.tournament, m.tournamentName, m.site, m.table, m.winner, m.sourceFile, m.date
  ];
  if (Array.isArray(m.players)) {
    m.players.forEach(p => { if (p && p.name) partes.push(p.name); });
  }
  if (Array.isArray(m.hero_cards)) partes.push(m.hero_cards.join(' '));
  return partes.some(x => x != null && String(x).toLowerCase().includes(ql));
}
function parseFechaMano(m) {
  if (!m || !m.date) return null;
  let s = String(m.date).trim().replace(/\s+UTC$/i, '').trim();
  let match = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (match) return new Date(+match[1], +match[2] - 1, +match[3]);
  match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (match) return new Date(+match[3], +match[2] - 1, +match[1]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}


function getHeroStackBB(m) {
  if (!m || !m.hero || !Array.isArray(m.players) || !m.bb || m.bb <= 0) return null;
  const p = m.players.find(x => x && x.name === m.hero);
  if (!p || p.stack == null || isNaN(Number(p.stack))) return null;
  return Number(p.stack) / Number(m.bb);
}

function torneosSeleccionados() {
  const multi = Array.isArray(CONFIG.filtroTorneos) ? CONFIG.filtroTorneos.map(String).filter(Boolean) : [];
  if (multi.length) return multi;
  if (CONFIG.filtroTorneo) return [String(CONFIG.filtroTorneo)];
  return [];
}
function manoEnTorneos(m, keys) {
  if (!keys || !keys.length) return true;
  const composite = `${m.site || ''}::${m.tournament || ''}`;
  const id = String(m.tournament || '');
  return keys.some(k => k === composite || k === id);
}
function manosConFiltros(opts = {}) {
  const { ignoreResultado=false, ignoreAccion=false, ignoreJugada=false, ignorePosicion=false, ignoreTorneo=false, ignoreBusqueda=false, ignoreSitio=false, ignoreFecha=false, ignoreBB=false, ignoreHero=false } = opts;
  const posF = ignorePosicion ? '' : (CONFIG.filtroPosicion||'');
  const torKeys = ignoreTorneo ? [] : torneosSeleccionados();
  const sitF = ignoreSitio ? '' : (CONFIG.filtroSitio||'');
  const heroList = ignoreHero ? [] : (Array.isArray(CONFIG.filtroHeroes) ? CONFIG.filtroHeroes.filter(Boolean) : []);
  const q = ignoreBusqueda ? '' : (CONFIG.busqueda||'').trim();
  const res = ignoreResultado ? 'all' : (CONFIG.filtroResultado||'all');
  const accList = ignoreAccion ? [] : (Array.isArray(CONFIG.filtroAcciones) ? CONFIG.filtroAcciones : (CONFIG.filtroAccion && CONFIG.filtroAccion !== 'all' ? [CONFIG.filtroAccion] : []));
  const jugList = ignoreJugada ? [] : (Array.isArray(CONFIG.filtroJugadas) ? CONFIG.filtroJugadas : []);
  const patrones = parsearRangoCartas(q);

  const dateFrom = ignoreFecha ? null : (CONFIG.filtroFechaDesde ? new Date(CONFIG.filtroFechaDesde + 'T00:00:00') : null);
  const dateTo   = ignoreFecha ? null : (CONFIG.filtroFechaHasta ? new Date(CONFIG.filtroFechaHasta + 'T23:59:59')   : null);

  return manos.filter(m => {
    const cls = clasificarResultado(m);
    if (res === 'win' && cls !== 'win') return false;
    if (res === 'loss' && cls !== 'loss') return false;
    if (res === 'showdown' && !m.hero_showdown) return false;
    if (res === 'fav' && !favoritas.has(m.id)) return false;
    if (accList.length && !accList.includes(cls)) return false;
    if (jugList.length && !manoCoincideJugadas(m, jugList)) return false;
    if (posF && getHeroPosicion(m) !== posF) return false;
    if (torKeys.length && !manoEnTorneos(m, torKeys)) return false;
    if (sitF && m.site !== sitF) return false;
    if (heroList.length) {
      const h = m.hero || '';
      if (!heroList.some(x => x === h || String(x).toLowerCase() === String(h).toLowerCase())) return false;
    }

    if (dateFrom || dateTo) {
      const fecha = parseFechaMano(m);
      if (!fecha) return false;
      if (dateFrom && fecha < dateFrom) return false;
      if (dateTo && fecha > dateTo) return false;
    }

    if (!ignoreBB) {
      const bbMin = CONFIG.filtroBBMin !== '' && CONFIG.filtroBBMin != null ? Number(CONFIG.filtroBBMin) : null;
      const bbMax = CONFIG.filtroBBMax !== '' && CONFIG.filtroBBMax != null ? Number(CONFIG.filtroBBMax) : null;
      if (bbMin != null && !isNaN(bbMin) || bbMax != null && !isNaN(bbMax)) {
        const heroBB = getHeroStackBB(m);
        if (heroBB == null) return false;
        if (bbMin != null && !isNaN(bbMin) && heroBB < bbMin) return false;
        if (bbMax != null && !isNaN(bbMax) && heroBB > bbMax) return false;
      }
    }

    if (q) {
      if (patrones.length) {
        if (!patrones.some(p => manoCoincideConRango(m.hero_cards, p))) return false;
      } else {
        if (!textoLibreCoincide(m, q)) return false;
      }
    }
    return true;
  });
}
function aplicarFiltros() {
  const idxMap = new Map(manos.map((m,i) => [m,i]));
  manosFiltradas = manosConFiltros().map(m => ({ m, idx: idxMap.get(m) }));
  const accList = Array.isArray(CONFIG.filtroAcciones) ? CONFIG.filtroAcciones : [];
  const jugList = Array.isArray(CONFIG.filtroJugadas) ? CONFIG.filtroJugadas : [];
  const heroListCfg = Array.isArray(CONFIG.filtroHeroes) ? CONFIG.filtroHeroes.filter(Boolean) : [];
  const hay = CONFIG.filtroResultado !== 'all' || accList.length > 0 || jugList.length > 0 || CONFIG.filtroPosicion || torneosSeleccionados().length || CONFIG.filtroSitio || heroListCfg.length > 0 || (CONFIG.busqueda||'').trim() || CONFIG.filtroFechaDesde || CONFIG.filtroFechaHasta || (CONFIG.filtroBBMin !== '' && CONFIG.filtroBBMin != null) || (CONFIG.filtroBBMax !== '' && CONFIG.filtroBBMax != null);
  const base = hay ? manosFiltradas.map(x => x.m) : manos;
  statsActuales = calcularEstadisticas(base);
  if (statsActuales) { statsActuales._filtrado = !!hay; statsActuales._totalFiltrado = base.length; }
  const badge = $('filtrosBadge');
  if (badge) {
    let n = 0;
    if (CONFIG.filtroResultado !== 'all') n++;
    if (accList.length) n++;
    if (jugList.length) n++;
    if (CONFIG.filtroPosicion) n++;
    if (torneosSeleccionados().length) n++;
    if (CONFIG.filtroSitio) n++;
    if (Array.isArray(CONFIG.filtroHeroes) && CONFIG.filtroHeroes.filter(Boolean).length) n++;
    if ((CONFIG.busqueda||'').trim()) n++;
    if (CONFIG.filtroFechaDesde || CONFIG.filtroFechaHasta) n++;
    if ((CONFIG.filtroBBMin !== '' && CONFIG.filtroBBMin != null) || (CONFIG.filtroBBMax !== '' && CONFIG.filtroBBMax != null)) n++;
    badge.textContent = n ? String(n) : '';
    badge.setAttribute('data-empty', n ? '0' : '1');
    const fBtn = $('btnOpenFilters');
    if (fBtn) fBtn.classList.toggle('has-filters', n > 0);
  }
  try { updateHlActiveFilters(); } catch (_) {}
  actualizarSessionBadge();
}

function renderFiltros() {
  const container = $('filtersBody'); if (!container) return;
  const POS = ['BTN','SB','BB','UTG','UTG+1','MP','LJ','HJ','CO'];
  const SITES = ['coinpoker', 'pokerstars', 'acr', 'generic'];
  const SITE_LABELS = {
    coinpoker: 'CoinPoker',
    pokerstars: 'PokerStars',
    acr: 'ACR / WPN',
    generic: 'Genérico'
  };
  const posA = CONFIG.filtroPosicion || '', torA = CONFIG.filtroTorneo || '', sitA = CONFIG.filtroSitio || '';
  const baseA = manosConFiltros({ ignoreAccion: true });
  const baseR = manosConFiltros({ ignoreResultado: true });
  const baseJ = manosConFiltros({ ignoreJugada: true });
  const baseT = manosConFiltros({ ignoreTorneo: true });
  const baseP = manosConFiltros({ ignorePosicion: true });
  const baseS = manosConFiltros({ ignoreSitio: true });
  const cntA = fn => baseA.filter(fn).length;
  const cntR = fn => baseR.filter(fn).length;
  const cntJ = fn => baseJ.filter(fn).length;
  const jugActivas = Array.isArray(CONFIG.filtroJugadas) ? CONFIG.filtroJugadas : [];
  const torneosMap = new Map();
  baseT.forEach(m => {
    if (m.tournament) {
      const key = `${m.site}::${m.tournament}`;
      if (!torneosMap.has(key)) torneosMap.set(key, {
        id: m.tournament, site: m.site, name: m.tournamentName || `Torneo ${m.tournament}`, n: 0
      });
      torneosMap.get(key).n++;
    }
  });
  const listaT = [...torneosMap.values()].sort((a,b) => (a.name||'').localeCompare(b.name||''));

  const heroCountMap = new Map();
  for (const m of manos) {
    let h = m.hero;
    if (!h && m.actions && Array.isArray(m.actions)) {
      const deal = m.actions.find(a => a.type === 'deal_hole' && a.cards && a.cards.length);
      if (deal) h = deal.player;
    }
    if (h) heroCountMap.set(h, (heroCountMap.get(h) || 0) + 1);
  }
  const listaHeroes = [...heroCountMap.entries()].sort((a,b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  const heroesActivos = Array.isArray(CONFIG.filtroHeroes) ? CONFIG.filtroHeroes : [];

  const activeTab = (document.querySelector('.hl-ftab.active') || {}).dataset?.ftab || 'mano';

  container.innerHTML = `
    <div class="hl-fpanel ${activeTab==='mano'?'active':''}" data-panel="mano">
      <div class="filter-group">
        <span class="filter-label">Cartas del héroe</span>
        <input type="text" class="filter-search" id="fSearch" placeholder="AA, AKo, A2-A9, A2s-A5s, 22-99, ATs+…" value="${CONFIG.busqueda||''}">
      </div>
      ${listaHeroes.length > 1 ? `
      <div class="filter-group">
        <span class="filter-label">Héroe (cuenta / alias)</span>
        <div class="filter-row filter-check-row" id="fHeroChecks">
          ${listaHeroes.map(([name, n]) => {
            const on = heroesActivos.some(x => x === name || String(x).toLowerCase() === String(name).toLowerCase());
            const label = aliasDe(name) || name;
            return `<label class="chip-check ${on?'active':''}">
              <input type="checkbox" data-hero="${escapeHtml(name)}" ${on?'checked':''}>
              ${escapeHtml(label)} <span class="count">${n}</span>
            </label>`;
          }).join('')}
        </div>
        <div style="font-size:11px;color:var(--text-3);margin-top:4px;">Marca uno o varios héroes para ver solo sus manos. Si no marcas ninguno, se muestran todos.</div>
      </div>` : ''}
      <div class="filter-group">
        <span class="filter-label">Resultado (puedes marcar varios)</span>
        <div class="filter-row filter-check-row">
          <label class="chip-check ${ (CONFIG.filtroAcciones||[]).includes('win') ? 'active' : '' }">
            <input type="checkbox" data-acc="win" ${ (CONFIG.filtroAcciones||[]).includes('win') ? 'checked' : '' }>
            🟢 Ganadas <span class="count">${cntA(m=>clasificarResultado(m)==='win')}</span>
          </label>
          <label class="chip-check ${ (CONFIG.filtroAcciones||[]).includes('loss') ? 'active' : '' }">
            <input type="checkbox" data-acc="loss" ${ (CONFIG.filtroAcciones||[]).includes('loss') ? 'checked' : '' }>
            🔴 Perdidas <span class="count">${cntA(m=>clasificarResultado(m)==='loss')}</span>
          </label>
          <label class="chip-check ${ (CONFIG.filtroAcciones||[]).includes('neutral') ? 'active' : '' }">
            <input type="checkbox" data-acc="neutral" ${ (CONFIG.filtroAcciones||[]).includes('neutral') ? 'checked' : '' }>
            ⚪ Neutras <span class="count">${cntA(m=>clasificarResultado(m)==='neutral')}</span>
          </label>
        </div>
      </div>
      <div class="filter-group">
        <span class="filter-label">Jugadas (del / contra el hero)</span>
        <div class="filter-row filter-check-row">
          <label class="chip-check ${ jugActivas.includes('3bet') ? 'active' : '' }">
            <input type="checkbox" data-jug="3bet" ${ jugActivas.includes('3bet') ? 'checked' : '' }>
            3BET <span class="count">${cntJ(m=>manoTieneJugada(m,'3bet'))}</span>
          </label>
          <label class="chip-check ${ jugActivas.includes('vs3bet') ? 'active' : '' }">
            <input type="checkbox" data-jug="vs3bet" ${ jugActivas.includes('vs3bet') ? 'checked' : '' }>
            vs 3BET <span class="count">${cntJ(m=>manoTieneJugada(m,'vs3bet'))}</span>
          </label>
          <label class="chip-check ${ jugActivas.includes('cbet') ? 'active' : '' }">
            <input type="checkbox" data-jug="cbet" ${ jugActivas.includes('cbet') ? 'checked' : '' }>
            C-BET <span class="count">${cntJ(m=>manoTieneJugada(m,'cbet'))}</span>
          </label>
          <label class="chip-check ${ jugActivas.includes('vscbet') ? 'active' : '' }">
            <input type="checkbox" data-jug="vscbet" ${ jugActivas.includes('vscbet') ? 'checked' : '' }>
            vs C-BET <span class="count">${cntJ(m=>manoTieneJugada(m,'vscbet'))}</span>
          </label>
          <label class="chip-check ${ jugActivas.includes('allin') ? 'active' : '' }">
            <input type="checkbox" data-jug="allin" ${ jugActivas.includes('allin') ? 'checked' : '' }>
            ALL-IN <span class="count">${cntJ(m=>manoTieneJugada(m,'allin'))}</span>
          </label>
          <label class="chip-check ${ jugActivas.includes('vsallin') ? 'active' : '' }">
            <input type="checkbox" data-jug="vsallin" ${ jugActivas.includes('vsallin') ? 'checked' : '' }>
            vs ALL-IN <span class="count">${cntJ(m=>manoTieneJugada(m,'vsallin'))}</span>
          </label>
        </div>
      </div>
      <div class="filter-group">
        <span class="filter-label">Etiquetas</span>
        <div class="filter-row">
          <div class="chip ${CONFIG.filtroResultado==='all'?'active':''}" data-res="all">Todas</div>
          <div class="chip ${CONFIG.filtroResultado==='showdown'?'active':''}" data-res="showdown">Showdown <span class="count">${cntR(m=>m.hero_showdown)}</span></div>
          <div class="chip ${CONFIG.filtroResultado==='fav'?'active':''}" data-res="fav">⭐ Favoritas <span class="count">${cntR(m=>favoritas.has(m.id))}</span></div>
        </div>
      </div>
    </div>

    <div class="hl-fpanel ${activeTab==='mesa'?'active':''}" data-panel="mesa">
      <div class="filter-group">
        <span class="filter-label">Stack del héroe (BB)</span>
        <div class="filter-row" style="display:flex;gap:6px;align-items:center;">
          <input type="number" class="filter-search" id="fBBMin" placeholder="Mín" min="0" step="any" inputmode="decimal" value="${CONFIG.filtroBBMin !== '' && CONFIG.filtroBBMin != null ? CONFIG.filtroBBMin : ''}" style="flex:1;min-width:0;">
          <span style="color:var(--text-3);font-size:12px;">—</span>
          <input type="number" class="filter-search" id="fBBMax" placeholder="Máx" min="0" step="any" inputmode="decimal" value="${CONFIG.filtroBBMax !== '' && CONFIG.filtroBBMax != null ? CONFIG.filtroBBMax : ''}" style="flex:1;min-width:0;">
        </div>
      </div>
      <div class="filter-group">
        <span class="filter-label">Posición</span>
        <select class="select-native" id="fPosicion">
          <option value="">Todas (${baseP.length})</option>
          ${POS.map(p => {
            const n = baseP.filter(m => getHeroPosicion(m)===p).length;
            if (!n && p !== posA) return '';
            return `<option value="${p}" ${posA===p?'selected':''}>${p} (${n})</option>`;
          }).join('')}
        </select>
      </div>
      <div class="filter-group">
        <span class="filter-label">Sala</span>
        <select class="select-native" id="fSitio">
          <option value="">Todas (${baseS.length})</option>
          ${SITES.map(s => {
            const n = baseS.filter(m => m.site === s).length;
            if (!n && s !== sitA) return '';
            return `<option value="${s}" ${sitA===s?'selected':''}>${SITE_LABELS[s] || s} (${n})</option>`;
          }).join('')}
        </select>
      </div>
    </div>

    <div class="hl-fpanel ${activeTab==='torneos'?'active':''}" data-panel="torneos">
      <div class="filter-group">
        <span class="filter-label">Torneos</span>
        <select class="select-native" id="fListaTorneos" style="margin-bottom:6px;">
          <option value="">Listas guardadas…</option>
          ${(Array.isArray(CONFIG.listasTorneos) ? CONFIG.listasTorneos : []).map(l => `<option value="${escapeHtml(l.id)}" ${CONFIG.listaTorneoActiva===l.id?'selected':''}>${escapeHtml(l.name)} (${(l.keys||[]).length})</option>`).join('')}
        </select>
        <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary" id="fListaAplicar" style="flex:1;min-width:90px;">Ver lista</button>
          <button type="button" class="btn btn-secondary" id="fListaGuardar" style="flex:1;min-width:90px;">Guardar lista</button>
          <button type="button" class="btn btn-secondary" id="fListaBorrar" style="flex:0 0 auto;color:var(--red);">Borrar</button>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:6px;">
          <button type="button" class="btn btn-secondary" id="fTorneoAll" style="flex:1;">Marcar todos</button>
          <button type="button" class="btn btn-secondary" id="fTorneoNone" style="flex:1;">Ninguno</button>
        </div>
        <div id="fTorneoChecks" style="max-height:220px;overflow:auto;display:flex;flex-direction:column;gap:4px;padding-right:2px;">
          ${listaT.length ? listaT.map(t => {
            const label = `${t.name}${t.site ? ' · ' + (SITE_LABELS[t.site] || t.site) : ''}`;
            const tKey = `${t.site || ''}::${t.id}`;
            const on = torneosSeleccionados().includes(tKey) || torneosSeleccionados().includes(String(t.id));
            return `<label class="chip-check ${on?'active':''}" style="justify-content:flex-start;width:100%;">
              <input type="checkbox" data-torneo="${escapeHtml(tKey)}" ${on?'checked':''}>
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(label)}</span>
              <span class="count">${t.n}</span>
            </label>`;
          }).join('') : '<div style="font-size:12px;color:var(--text-3);">No hay torneos en las manos cargadas.</div>'}
        </div>
        <div style="font-size:11px;color:var(--text-3);margin-top:6px;">Marca los torneos y guárdalos como lista para volver a verlos juntos.</div>
      </div>
    </div>

    <div class="hl-fpanel ${activeTab==='fechas'?'active':''}" data-panel="fechas">
      <div class="filter-group">
        <span class="filter-label">Rango de fechas</span>
        <div class="filter-row" style="display:flex;gap:6px;">
          <input type="date" class="filter-date" id="fDateFrom" value="${CONFIG.filtroFechaDesde || ''}" placeholder="Desde">
          <input type="date" class="filter-date" id="fDateTo" value="${CONFIG.filtroFechaHasta || ''}" placeholder="Hasta">
        </div>
        <div class="filter-row" style="margin-top:6px;">
          <div class="chip" data-range="7d">7 días</div>
          <div class="chip" data-range="30d">30 días</div>
          <div class="chip" data-range="90d">90 días</div>
          <div class="chip" data-range="all">Todo</div>
        </div>
      </div>
      <div style="margin-top:8px;">
        <button type="button" class="btn btn-secondary" id="fDeleteFiltered" style="width:100%;color:var(--red);border-color:rgba(248,113,113,0.35);background:rgba(248,113,113,0.06);">
          🗑️ Eliminar las ${manosFiltradas.length} filtradas
        </button>
      </div>
    </div>
  `;

  /* Sincronizar búsqueda rápida del toolbar */
  const quick = $('fSearchQuick');
  if (quick && quick.value !== (CONFIG.busqueda || '')) quick.value = CONFIG.busqueda || '';

  let st;
  const bindSearch = (el) => {
    if (!el) return;
    el.oninput = e => {
      clearTimeout(st);
      st = setTimeout(() => {
        CONFIG.busqueda = e.target.value;
        const other = el.id === 'fSearch' ? $('fSearchQuick') : $('fSearch');
        if (other && other.value !== e.target.value) other.value = e.target.value;
        guardarYRefrescar(true);
        updateHlActiveFilters();
      }, 200);
    };
  };
  bindSearch($('fSearch'));
  bindSearch($('fSearchQuick'));

  container.querySelectorAll('input[data-acc]').forEach(inp => {
    inp.onchange = () => {
      const list = Array.from(container.querySelectorAll('input[data-acc]:checked')).map(i => i.dataset.acc);
      CONFIG.filtroAcciones = list;
      CONFIG.filtroAccion = list.length === 1 ? list[0] : (list.length ? 'multi' : 'all');
      guardarYRefrescar(true);
      updateHlActiveFilters();
    };
  });
  container.querySelectorAll('input[data-jug]').forEach(inp => {
    inp.onchange = () => {
      CONFIG.filtroJugadas = Array.from(container.querySelectorAll('input[data-jug]:checked')).map(i => i.dataset.jug);
      guardarYRefrescar(true);
      updateHlActiveFilters();
    };
  });
  container.querySelectorAll('input[data-hero]').forEach(inp => {
    inp.onchange = () => {
      CONFIG.filtroHeroes = Array.from(container.querySelectorAll('input[data-hero]:checked')).map(i => i.dataset.hero);
      container.querySelectorAll('#fHeroChecks .chip-check').forEach(lab => {
        const i = lab.querySelector('input');
        lab.classList.toggle('active', !!(i && i.checked));
      });
      guardarYRefrescar(true);
      updateHlActiveFilters();
    };
  });
  container.querySelectorAll('[data-res]').forEach(c => c.onclick = () => {
    CONFIG.filtroResultado = c.dataset.res;
    guardarYRefrescar(true);
    updateHlActiveFilters();
    /* re-marcar chips activos sin rebuild completo si skip */
    container.querySelectorAll('[data-res]').forEach(x => x.classList.toggle('active', x.dataset.res === CONFIG.filtroResultado));
  });
  const fPos = $('fPosicion');
  if (fPos) fPos.onchange = () => { CONFIG.filtroPosicion = fPos.value; guardarYRefrescar(true); updateHlActiveFilters(); };
  function aplicarChecksTorneo() {
    const keys = [...container.querySelectorAll('#fTorneoChecks input[data-torneo]:checked')].map(el => el.dataset.torneo);
    CONFIG.filtroTorneos = keys;
    CONFIG.filtroTorneo = '';
    container.querySelectorAll('#fTorneoChecks .chip-check').forEach(lab => {
      const inp = lab.querySelector('input');
      lab.classList.toggle('active', !!(inp && inp.checked));
    });
    guardarYRefrescar(true);
    updateHlActiveFilters();
  }
  container.querySelectorAll('#fTorneoChecks input[data-torneo]').forEach(inp => {
    inp.onchange = () => aplicarChecksTorneo();
  });
  const btnAll = $('fTorneoAll');
  const btnNone = $('fTorneoNone');
  if (btnAll) btnAll.onclick = () => {
    container.querySelectorAll('#fTorneoChecks input[data-torneo]').forEach(el => { el.checked = true; });
    aplicarChecksTorneo();
  };
  if (btnNone) btnNone.onclick = () => {
    container.querySelectorAll('#fTorneoChecks input[data-torneo]').forEach(el => { el.checked = false; });
    CONFIG.listaTorneoActiva = '';
    aplicarChecksTorneo();
  };
  const selLista = $('fListaTorneos');
  if (selLista) selLista.onchange = () => { CONFIG.listaTorneoActiva = selLista.value || ''; };
  const btnLista = $('fListaAplicar');
  if (btnLista) btnLista.onclick = () => {
    const id = ($('fListaTorneos') && $('fListaTorneos').value) || CONFIG.listaTorneoActiva || '';
    const lista = (CONFIG.listasTorneos || []).find(l => l.id === id);
    if (!lista) { alert('Elige una lista guardada.'); return; }
    CONFIG.listaTorneoActiva = lista.id;
    CONFIG.filtroTorneos = [...(lista.keys || [])];
    CONFIG.filtroTorneo = '';
    guardarYRefrescar(true);
    updateHlActiveFilters();
    renderFiltros();
  };
  const btnSaveLista = $('fListaGuardar');
  if (btnSaveLista) btnSaveLista.onclick = () => {
    const keys = [...container.querySelectorAll('#fTorneoChecks input[data-torneo]:checked')].map(el => el.dataset.torneo);
    if (!keys.length) { alert('Marca al menos un torneo.'); return; }
    const prev = (CONFIG.listasTorneos || []).find(l => l.id === CONFIG.listaTorneoActiva);
    const nombre = prompt('Nombre de la lista de torneos', prev ? prev.name : '');
    if (!nombre || !nombre.trim()) return;
    if (!Array.isArray(CONFIG.listasTorneos)) CONFIG.listasTorneos = [];
    if (prev) {
      prev.name = nombre.trim();
      prev.keys = keys;
    } else {
      const id = 'lt_' + Date.now().toString(36);
      CONFIG.listasTorneos.push({ id, name: nombre.trim(), keys });
      CONFIG.listaTorneoActiva = id;
    }
    CONFIG.filtroTorneos = keys;
    CONFIG.filtroTorneo = '';
    guardarYRefrescar(true);
    updateHlActiveFilters();
    renderFiltros();
  };
  const btnDelLista = $('fListaBorrar');
  if (btnDelLista) btnDelLista.onclick = () => {
    const id = ($('fListaTorneos') && $('fListaTorneos').value) || CONFIG.listaTorneoActiva || '';
    if (!id) { alert('Elige la lista que quieres borrar.'); return; }
    CONFIG.listasTorneos = (CONFIG.listasTorneos || []).filter(l => l.id !== id);
    if (CONFIG.listaTorneoActiva === id) CONFIG.listaTorneoActiva = '';
    guardarYRefrescar(true);
    updateHlActiveFilters();
    renderFiltros();
  };
  const fSitio = $('fSitio');
  if (fSitio) fSitio.onchange = () => { CONFIG.filtroSitio = fSitio.value; guardarYRefrescar(true); updateHlActiveFilters(); };
  const fBBMin = $('fBBMin');
  const fBBMax = $('fBBMax');
  if (fBBMin) fBBMin.onchange = fBBMin.oninput = () => {
    const v = fBBMin.value.trim();
    CONFIG.filtroBBMin = v === '' ? '' : v;
    guardarYRefrescar(true);
    updateHlActiveFilters();
  };
  if (fBBMax) fBBMax.onchange = fBBMax.oninput = () => {
    const v = fBBMax.value.trim();
    CONFIG.filtroBBMax = v === '' ? '' : v;
    guardarYRefrescar(true);
    updateHlActiveFilters();
  };

  /* Footer buttons viven fuera de filtersBody */
  const fReset = $('fReset');
  if (fReset) fReset.onclick = () => {
    CONFIG.filtroResultado = 'all'; CONFIG.filtroAccion = 'all'; CONFIG.filtroAcciones = [];
    CONFIG.filtroJugadas = [];
    CONFIG.filtroPosicion = ''; CONFIG.filtroTorneo = ''; CONFIG.filtroTorneos = []; CONFIG.listaTorneoActiva = ''; CONFIG.filtroSitio = ''; CONFIG.filtroHeroes = []; CONFIG.busqueda = '';
    CONFIG.filtroFechaDesde = ''; CONFIG.filtroFechaHasta = '';
    CONFIG.filtroBBMin = ''; CONFIG.filtroBBMax = '';
    const q = $('fSearchQuick'); if (q) q.value = '';
    guardarYRefrescar();
    updateHlActiveFilters();
  };
  const fApply = $('fApply');
  if (fApply) fApply.onclick = () => {
    /* sincronizar fechas por si el change no disparó */
    const fFrom = $('fDateFrom'); const fTo = $('fDateTo');
    if (fFrom) CONFIG.filtroFechaDesde = fFrom.value || '';
    if (fTo) CONFIG.filtroFechaHasta = fTo.value || '';
    guardarYRefrescar();
    updateHlActiveFilters();
    closeFiltersModal();
    const b = fApply; b.textContent = '✓ Aplicado';
    setTimeout(() => { b.textContent = '✅ Aplicar'; }, 700);
  };

  const fFrom = $('fDateFrom');
  const fTo = $('fDateTo');
  function bindDateInput(el, key) {
    if (!el) return;
    el.addEventListener('change', () => {
      CONFIG[key] = el.value || '';
      guardarYRefrescar(true);
      updateHlActiveFilters();
    });
    el.addEventListener('click', (e) => {
      try {
        if (typeof el.showPicker === 'function') {
          e.preventDefault();
          el.showPicker();
        }
      } catch (_) { }
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        try { if (typeof el.showPicker === 'function') el.showPicker(); } catch (_) {}
      }
    });
  }
  bindDateInput(fFrom, 'filtroFechaDesde');
  bindDateInput(fTo, 'filtroFechaHasta');

  container.querySelectorAll('[data-range]').forEach(chip => {
    chip.onclick = () => {
      const r = chip.dataset.range;
      if (r === 'all') {
        CONFIG.filtroFechaDesde = '';
        CONFIG.filtroFechaHasta = '';
      } else {
        const days = parseInt(r, 10) || 7;
        const now = new Date();
        const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        const fmtISO = d => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        };
        CONFIG.filtroFechaDesde = fmtISO(from);
        CONFIG.filtroFechaHasta = fmtISO(now);
      }
      if (fFrom) fFrom.value = CONFIG.filtroFechaDesde || '';
      if (fTo) fTo.value = CONFIG.filtroFechaHasta || '';
      guardarYRefrescar(true);
      updateHlActiveFilters();
    };
  });

  const btnDelFilt = $('fDeleteFiltered');
  if (btnDelFilt) {
    btnDelFilt.onclick = async () => {
      const filtradas = (manosFiltradas || []).map(x => x.m).filter(Boolean);
      if (!filtradas.length) {
        showToast('No hay manos filtradas', 'error');
        return;
      }
      const total = manos.length;
      if (filtradas.length === total) {
        if (!confirm(`⚠️ Esto eliminará TODAS las ${total} manos. ¿Continuar?`)) return;
      } else {
        if (!confirm(`¿Eliminar ${filtradas.length} de ${total} manos (las que cumplen los filtros actuales)?`)) return;
      }
      setLoading(true);
      try {
        const ids = filtradas.map(m => m.id);
        const r = await FeltLabAPI.feltlab.bulkDelete(ids);
        const idSet = new Set(ids);
        manos = manos.filter(m => !idSet.has(m.id));
        for (const id of ids) {
          delete notesDB[id];
          favoritas.delete(id);
        }
        manoActual = 0;
        pasoActual = 0;
        detener();
        potEl.textContent = 'Bote: 0';
        boardEl.innerHTML = '';
        logEl.innerHTML = '';
        document.querySelectorAll('.player').forEach(e => e.remove());
        actualizarBanner();
        aplicarFiltros();
        renderHandsList({ scrollTop: true });
        renderStats();
        renderFiltros();
        renderNotesList();
        actualizarSessionBadge();
        updateHlActiveFilters();
        showToast(`Eliminadas ${(r && r.deleted) || ids.length} manos ✓`, 'success');
      } catch (err) {
        showToast('Error: ' + (err.message || err), 'error');
      } finally {
        setLoading(false);
      }
    };
  }

    updateHlActiveFilters();
  /* forzar pestañas: solo el panel activo visible */
  const _tab = (document.querySelector('.hl-ftab.active') || {}).dataset?.ftab || 'mano';
  document.querySelectorAll('#filtersBody .hl-fpanel').forEach(p => {
    const on = p.dataset.panel === _tab;
    p.classList.toggle('active', on);
    p.style.display = on ? 'flex' : 'none';
  });
}
function openFiltersModal() {
  const m = $('filtersModal');
  if (!m) return;
  renderFiltros();
  m.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeFiltersModal() {
  const m = $('filtersModal');
  if (m) m.classList.remove('open');
  document.body.style.overflow = '';
}
function switchHlFilterTab(tab) {
  document.querySelectorAll('.hl-ftab').forEach(t => t.classList.toggle('active', t.dataset.ftab === tab));
  document.querySelectorAll('#filtersBody .hl-fpanel').forEach(p => {
    const on = p.dataset.panel === tab;
    p.classList.toggle('active', on);
    p.style.display = on ? 'flex' : 'none';
  });
}
function updateHlActiveFilters() {
  const wrap = $('hlActiveFilters');
  if (!wrap) return;
  const chips = [];
  if ((CONFIG.busqueda || '').trim()) chips.push(`<button type="button" class="hl-active-chip" data-clear="busqueda">🃏 ${escapeHtml(CONFIG.busqueda.trim())} ✕</button>`);
  if (CONFIG.filtroResultado && CONFIG.filtroResultado !== 'all') chips.push(`<button type="button" class="hl-active-chip" data-clear="resultado">🏷️ ${CONFIG.filtroResultado} ✕</button>`);
  const acc = Array.isArray(CONFIG.filtroAcciones) ? CONFIG.filtroAcciones : [];
  if (acc.length) chips.push(`<button type="button" class="hl-active-chip" data-clear="acciones">📊 ${acc.join(',')} ✕</button>`);
  const jug = Array.isArray(CONFIG.filtroJugadas) ? CONFIG.filtroJugadas : [];
  if (jug.length) chips.push(`<button type="button" class="hl-active-chip" data-clear="jugadas">🎯 ${jug.join(',')} ✕</button>`);
  if (CONFIG.filtroPosicion) chips.push(`<button type="button" class="hl-active-chip" data-clear="posicion">📍 ${CONFIG.filtroPosicion} ✕</button>`);
  if (CONFIG.filtroSitio) chips.push(`<button type="button" class="hl-active-chip" data-clear="sitio">🏠 ${CONFIG.filtroSitio} ✕</button>`);
  if (Array.isArray(CONFIG.filtroHeroes) && CONFIG.filtroHeroes.filter(Boolean).length) {
    const hs = CONFIG.filtroHeroes.filter(Boolean);
    const label = hs.length === 1 ? (aliasDe(hs[0]) || hs[0]) : `${hs.length} héroes`;
    chips.push(`<button type="button" class="hl-active-chip" data-clear="heroes">👤 ${label} ✕</button>`);
  }
  if (torneosSeleccionados().length) chips.push(`<button type="button" class="hl-active-chip" data-clear="torneos">🏆 ${torneosSeleccionados().length} torneo(s) ✕</button>`);
  if (CONFIG.filtroFechaDesde || CONFIG.filtroFechaHasta) {
    const a = CONFIG.filtroFechaDesde || '…';
    const b = CONFIG.filtroFechaHasta || '…';
    chips.push(`<button type="button" class="hl-active-chip" data-clear="fechas">📅 ${a} → ${b} ✕</button>`);
  }
  if ((CONFIG.filtroBBMin !== '' && CONFIG.filtroBBMin != null) || (CONFIG.filtroBBMax !== '' && CONFIG.filtroBBMax != null)) {
    chips.push(`<button type="button" class="hl-active-chip" data-clear="bb">BB ${CONFIG.filtroBBMin || '0'}–${CONFIG.filtroBBMax || '∞'} ✕</button>`);
  }
  wrap.innerHTML = chips.join('');
  wrap.style.display = chips.length ? 'flex' : 'none';
  wrap.querySelectorAll('[data-clear]').forEach(btn => {
    btn.onclick = () => {
      const k = btn.dataset.clear;
      if (k === 'busqueda') { CONFIG.busqueda = ''; const q=$('fSearchQuick'); if(q) q.value=''; const s=$('fSearch'); if(s) s.value=''; }
      if (k === 'resultado') CONFIG.filtroResultado = 'all';
      if (k === 'acciones') { CONFIG.filtroAcciones = []; CONFIG.filtroAccion = 'all'; }
      if (k === 'jugadas') CONFIG.filtroJugadas = [];
      if (k === 'posicion') CONFIG.filtroPosicion = '';
      if (k === 'sitio') CONFIG.filtroSitio = '';
      if (k === 'heroes') CONFIG.filtroHeroes = [];
      if (k === 'torneos') { CONFIG.filtroTorneos = []; CONFIG.filtroTorneo = ''; CONFIG.listaTorneoActiva = ''; }
      if (k === 'fechas') { CONFIG.filtroFechaDesde = ''; CONFIG.filtroFechaHasta = ''; }
      if (k === 'bb') { CONFIG.filtroBBMin = ''; CONFIG.filtroBBMax = ''; }
      guardarYRefrescar();
      updateHlActiveFilters();
    };
  });
}

function guardarYRefrescar(skip=false) {
  saveConfig();
  aplicarFiltros();
  window._hlDirtyList = true;
  window._hlDirtyStats = true;
  /* No forzar scroll al filtrar: evita saltos en PC y móvil */
  renderHandsList({ scrollTop: false });
  window._hlDirtyList = false;
  renderStats();
  window._hlDirtyStats = false;
  const prev = document.activeElement;
  const focusedId = prev && prev.id;
  const focused = focusedId === 'fSearch' || focusedId === 'fSearchQuick' || focusedId === 'fDateFrom' || focusedId === 'fDateTo' || focusedId === 'fBBMin' || focusedId === 'fBBMax';
  const ss = (focusedId === 'fSearch' || focusedId === 'fSearchQuick') ? prev.selectionStart : null;
  const se = (focusedId === 'fSearch' || focusedId === 'fSearchQuick') ? prev.selectionEnd : null;
  /* Solo reconstruir el modal si está abierto y no estamos en un input (skip) */
  const modalOpen = !!document.querySelector('#filtersModal.open');
  if (!skip && modalOpen) renderFiltros();
  if (focused && prev && document.body.contains(prev)) {
    try {
      prev.focus();
      if (ss != null) prev.setSelectionRange(ss, se);
    } catch {}
  }
  try { updateHlActiveFilters(); } catch (_) {}
  const idxF = manosFiltradas.findIndex(x => x.idx === manoActual);
  if (idxF === -1 && manosFiltradas.length) {
    cargarMano(manosFiltradas[0].idx, { suppressScroll: true });
  }
}

/* ═══════════════════════════════════════════════════════
   CARTAS
   ═══════════════════════════════════════════════════════ */
function datosCarta(c) {
  if (!c || c.length < 2) return { valor: '?', paloSimbolo: '?', paloClase: 'palo-s' };
  const valor = c.slice(0,-1), paloMap = {s:'♠',h:'♥',d:'♦',c:'♣'}, k = c.slice(-1);
  return { valor, paloSimbolo: paloMap[k] || '?', paloClase: 'palo-' + (paloMap[k] ? k : 's') };
}
function renderCarta(c, oculta=false) {
  if (oculta) return `<div class="card back"></div>`;
  const { valor, paloSimbolo, paloClase } = datosCarta(c);
  return `<div class="card ${paloClase}"><div class="corner tl"><div class="r">${valor}</div></div><div class="center-suit">${paloSimbolo}</div><div class="corner br"><div class="r">${valor}</div></div></div>`;
}
function renderMiniCarta(c) {
  const { valor, paloSimbolo, paloClase } = datosCarta(c);
  return `<div class="mini-card ${paloClase}"><span class="mini-r">${valor}</span><span class="mini-s">${paloSimbolo}</span></div>`;
}

/* ═══════════════════════════════════════════════════════
   BANNER INFO TORNEO
   ═══════════════════════════════════════════════════════ */
function actualizarBanner() {
  if (!tableInfoBanner) return;
  const mano = manos[manoActual];
  if (!mano) {
    tableInfoBanner.style.display = 'none';
    tableInfoBanner.classList.remove('visible');
    return;
  }
  const torneoNombre = mano.tournamentName || (mano.tournament ? `Torneo ${mano.tournament}` : 'Cash / Sin torneo');
  const torneoId = mano.tournament ? `#${mano.tournament}` : '';
  const sitioLabel = ({
    coinpoker: 'CoinPoker',
    pokerstars: 'PokerStars',
    acr: 'ACR / WPN',
    generic: 'Genérico'
  }[mano.site] || mano.site || 'Generic');
  const blinds = mano.blinds ? `${mano.blinds[0]}/${mano.blinds[1]}` : '';
  const idxActual = (manosFiltradas.findIndex(x => x.idx === manoActual) + 1) || '?';
  const totalManos = manosFiltradas.length || 0;
  const nPlayers = (mano.players || []).filter(p => p && p.name && !p.waiting && !p.sitting_out && !p.sittingOut).length;
  const tableMaxTxt = mano.tableMax ? `${mano.tableMax}-max` : `${nPlayers}-max`;

  tableInfoBanner.innerHTML = `
    <span class="tib-site">${escapeHtml(sitioLabel)}</span>
    <span class="tib-title">${escapeHtml(torneoNombre)}${torneoId ? `<span class="tib-id">${escapeHtml(torneoId)}</span>` : ''}</span>
    ${blinds ? `<span class="tib-blinds">${escapeHtml(blinds)}</span>` : ''}
    <span class="tib-badge">Mano ${idxActual}/${totalManos} · ${tableMaxTxt}</span>
  `;
  tableInfoBanner.style.display = 'flex';
  tableInfoBanner.removeAttribute('hidden');
  tableInfoBanner.classList.add('visible');
}

/* ═══════════════════════════════════════════════════════
   MESA
   ═══════════════════════════════════════════════════════ */
function cargarMano(idx, opts = {}) {
  detener(); manoActual = idx;
  const manoRaw = manos[idx]; if (!manoRaw) return;
  const mano = aliasMano(manoRaw);
  pasoActual = 0;
  if (CONFIG.saltarAntes && Array.isArray(mano.actions)) {
    let dealIdx = -1;
    for (let i = 0; i < mano.actions.length; i++) {
      const a = mano.actions[i];
      if (a.type === 'deal_hole' && a.player === mano.hero && a.cards && a.cards.length) {
        dealIdx = i;
        break;
      }
    }
    if (dealIdx < 0) {
      for (let i = 0; i < mano.actions.length; i++) {
        const a = mano.actions[i];
        if (a.type === 'deal_hole' && a.cards && a.cards.length) {
          dealIdx = i;
          break;
        }
      }
    }
    if (dealIdx < 0) {
      for (let i = 0; i < mano.actions.length; i++) {
        if (mano.actions[i].type === 'deal_hole') { dealIdx = i; break; }
      }
    }
    if (dealIdx >= 0) pasoActual = dealIdx + 1;
  }
  if (infoEl) infoEl.textContent = '';
  logEl.innerHTML = ''; potEl.textContent = 'Bote: 0'; boardEl.innerHTML = '';
  dibujarJugadores(mano); renderEstado(mano, pasoActual);
  cargarNotaActual();
  actualizarBanner();
  if (opts && opts.scrollCurrent === true) {
    markCurrentHand(idx);
  }
}

function dibujarJugadores(mano) {
  document.querySelectorAll('.player').forEach(e => e.remove());
  const railOld = tableScene.querySelector('.waiting-rail');
  if (railOld) railOld.remove();
  if (tableScene && !tableScene.querySelector('.poker-table')) {
    const felt = document.createElement('div');
    felt.className = 'poker-table';
    tableScene.insertBefore(felt, tableScene.firstChild);
  }

  const all = [...(mano.players || [])];
  const btnSeat = mano.button != null ? Number(mano.button) : null;

  let players = all.filter(p => p && (p.name || p.seat != null));
  if (btnSeat != null && !players.some(p => Number(p.seat) === btnSeat)) {
    players.push({ seat: btnSeat, name: 'BTN', stack: 0, waiting: true, isGhost: true });
  }
  players.sort((a, b) => Number(a.seat) - Number(b.seat));
  const n = players.length;
  if (!n) return;

  let btnIdx = 0;
  if (btnSeat != null) {
    const bi = players.findIndex(p => Number(p.seat) === btnSeat);
    if (bi >= 0) btnIdx = bi;
  }
  let heroIdx = 0;
  if (mano.hero) {
    const heroLower = String(mano.hero).toLowerCase();
    let hi = players.findIndex(p => p.name === mano.hero);
    if (hi < 0) hi = players.findIndex(p => String(p.name || '').toLowerCase() === heroLower);
    if (hi >= 0) heroIdx = hi;
  } else if (Array.isArray(mano.actions)) {
    // Fallback: player who received hole cards with ranks is the hero
    const deal = mano.actions.find(a => a && a.type === 'deal_hole' && a.cards && a.cards.length);
    if (deal && deal.player) {
      const dl = String(deal.player).toLowerCase();
      let hi = players.findIndex(p => p.name === deal.player || String(p.name || '').toLowerCase() === dl);
      if (hi >= 0) {
        heroIdx = hi;
        mano.hero = deal.player;
        if (!(mano.hero_cards && mano.hero_cards.length)) mano.hero_cards = deal.cards.slice();
      }
    }
  }

  const visual = [];
  const rx = 36, ry = 30;
  for (let v = 0; v < n; v++) {
    const angle = Math.PI / 2 + (v / n) * 2 * Math.PI;
    const left = 50 + rx * Math.cos(angle);
    const top = 50 + ry * Math.sin(angle);
    visual.push({
      top: Math.max(14, Math.min(88, top)) + '%',
      left: Math.max(10, Math.min(90, left)) + '%'
    });
  }

  players.forEach((p, i) => {
    const visIdx = (i - heroIdx + n) % n;
    const pos = visual[visIdx];
    const relIdx = (i - btnIdx + n) % n;
    const posLabel = etiquetaPosicion(relIdx, n);
    const div = document.createElement('div');
    const isGhost = !!p.isGhost;
    const isOff = !!(p.waiting || p.sitting_out || p.sittingOut) || isGhost;
    const isHeroSeat = !!(mano.hero && (
      p.name === mano.hero ||
      String(p.name || '').toLowerCase() === String(mano.hero).toLowerCase()
    ));
    div.className = 'player' + (isOff ? ' folded sitting-out' : '') + (isHeroSeat ? ' is-hero' : '');
    div.id = isGhost ? 'player-ghost-' + p.seat : 'player-' + p.name;
    div.style.top = pos.top;
    div.style.left = pos.left;
    div.style.transform = 'translate(-50%,-50%)';
    const dealer = (btnSeat != null && Number(p.seat) === btnSeat) ? '<div class="dealer-btn">D</div>' : '';
    const offTag = isOff
      ? `<div class="off-badge">${p.sitting_out || p.sittingOut ? 'OFF' : (isGhost ? '—' : 'WAIT')}</div>`
      : '';
    if (isGhost) {
      div.innerHTML = `<div class="avatar-wrap">${dealer}<div class="avatar">${posLabel}</div>${offTag}</div><div class="stack-badge">—</div><div class="name-badge">—</div><div class="cards"></div><div class="action-tag"></div>`;
    } else {
      const stackTxt = (p.stack != null && !isNaN(p.stack)) ? fmtStack(p.stack, mano.bb) : '—';
      div.innerHTML = `<div class="avatar-wrap">${dealer}<div class="avatar">${posLabel}</div>${offTag}</div><div class="stack-badge">${stackTxt}</div><div class="name-badge">${escapeHtml(p.name || '')}</div><div class="cards"></div><div class="action-tag"></div>`;
    }
    tableScene.appendChild(div);
  });
}

function resetVisual() {
  document.querySelectorAll('.player').forEach(el => {
    el.classList.remove('active','winner','allin-player');
    const tag = el.querySelector('.action-tag');
    if (tag) { tag.style.display='none'; tag.textContent=''; tag.classList.remove('allin-tag'); }
    const cards = el.querySelector('.cards'); if (cards) cards.innerHTML='';
  });
}

function renderEstado(mano, hasta) {
  resetVisual();
  let pot = 0, board = [];
  const visibles = mano.actions.slice(0, hasta);
  const ultima = visibles[visibles.length - 1];
  const stacks = {};
  (mano.players || []).forEach(p => { if (p && p.name) stacks[p.name] = p.stack; });
  const allinPlayers = new Set();
  const folded = new Set();
  const shownCards = {};
  const knownCards = {};
  const mucked = new Set();
  let holeDealt = false;

  if (mano.hero && mano.hero_cards && mano.hero_cards.length) {
    knownCards[mano.hero] = mano.hero_cards.slice();
  }

  visibles.forEach(a => {
    if (a.player && stacks[a.player] != null) {
      if (['ante', 'blind', 'call', 'bet'].includes(a.type)) {
        const amt = a.amount || 0;
        stacks[a.player] = Math.max(0, stacks[a.player] - amt);
        pot += amt;
        if (stacks[a.player] < 0.005) allinPlayers.add(a.player);
      } else if (a.type === 'raise') {
        const amt = a.amount != null ? a.amount : (a.to || 0);
        stacks[a.player] = Math.max(0, stacks[a.player] - amt);
        pot += amt;
        if (stacks[a.player] < 0.005) allinPlayers.add(a.player);
      } else if (a.type === 'allin') {
        const amt = a.amount || 0;
        stacks[a.player] = Math.max(0, stacks[a.player] - amt);
        pot += amt;
        allinPlayers.add(a.player);
      } else if (a.type === 'return') {
        stacks[a.player] = (stacks[a.player] || 0) + (a.amount || 0);
        pot = Math.max(0, pot - (a.amount || 0));
      } else if (a.type === 'collect' && a.pot !== 'summary') {
        stacks[a.player] = (stacks[a.player] || 0) + (a.amount || 0);
      }
    } else {
      if (['ante', 'blind', 'call', 'bet', 'allin'].includes(a.type)) pot += (a.amount || 0);
      if (a.type === 'raise') pot += (a.amount != null ? a.amount : (a.to || 0));
    }

    if (a.type === 'street') board = a.board;

    if (a.type === 'deal_hole') {
      holeDealt = true;
      if (a.cards && a.cards.length) knownCards[a.player] = a.cards.slice();
      sonido(700, 0.06, 'triangle', 0.03);
    }

    if (a.type === 'show') {
      if (a.cards && a.cards.length) {
        shownCards[a.player] = a.cards.slice();
        knownCards[a.player] = a.cards.slice();
      }
    }

    if (a.type === 'muck') mucked.add(a.player);

    if (a.type === 'fold') {
      folded.add(a.player);
      const el = document.getElementById('player-' + a.player);
      if (el) el.classList.add('folded');
    }

    if (['call', 'bet', 'raise', 'allin'].includes(a.type)) sonido(1100, 0.04, 'square', 0.025);
    if (a.type === 'collect') sonido(880, 0.12);
  });

  if (!holeDealt && visibles.some(a =>
    ['street', 'fold', 'check', 'call', 'bet', 'raise', 'allin', 'show', 'muck'].includes(a.type)
  )) {
    holeDealt = true;
  }

  // Ensure hero + hero_cards recovered from actions if missing/empty
  if ((!mano.hero || !(mano.hero_cards && mano.hero_cards.length)) && Array.isArray(mano.actions)) {
    const deal = mano.actions.find(a => a && a.type === 'deal_hole' && a.cards && a.cards.length);
    if (deal) {
      if (!mano.hero) mano.hero = deal.player;
      if (!(mano.hero_cards && mano.hero_cards.length)) mano.hero_cards = deal.cards.slice();
      if (deal.player && !knownCards[deal.player]) knownCards[deal.player] = deal.cards.slice();
    }
  }
  // Also fill knownCards for hero from hero_cards field
  if (mano.hero && mano.hero_cards && mano.hero_cards.length && !knownCards[mano.hero]) {
    knownCards[mano.hero] = mano.hero_cards.slice();
  }

  (mano.players || []).forEach(p => {
    if (!p || !p.name || p.waiting || p.sitting_out || p.sittingOut || p.isGhost) return;
    const el = document.getElementById('player-' + p.name);
    if (!el) return;
    const box = el.querySelector('.cards');
    if (!box) return;

    const heroName = mano.hero ? String(mano.hero) : '';
    const nameLower = String(p.name || '').toLowerCase();
    const heroLower = heroName.toLowerCase();
    let isHero = !!heroName && (p.name === heroName || nameLower === heroLower);

    // Case-insensitive lookup of known cards (alias mismatches)
    let known = knownCards[p.name];
    if ((!known || !known.length) && heroLower) {
      for (const k of Object.keys(knownCards)) {
        if (String(k).toLowerCase() === nameLower && knownCards[k] && knownCards[k].length) {
          known = knownCards[k];
          break;
        }
      }
    }
    // If this seat holds the hero's cards, treat as hero
    if (!isHero && known && known.length && Array.isArray(mano.hero_cards) && mano.hero_cards.length) {
      if (known.length === mano.hero_cards.length && known.every((c, i) => c === mano.hero_cards[i])) {
        isHero = true;
      }
    }
    if (isHero) el.classList.add('is-hero');

    if (!holeDealt) {
      // Even before "deal" step completes in edge cases, show hero cards if we know them
      if (isHero) {
        const cards = (mano.hero_cards && mano.hero_cards.length) ? mano.hero_cards : (known || []);
        if (cards.length) {
          box.innerHTML = cards.map(c => renderCarta(c)).join('');
          return;
        }
      }
      box.innerHTML = '';
      return;
    }

    if (shownCards[p.name] && shownCards[p.name].length) {
      box.innerHTML = shownCards[p.name].map(c => renderCarta(c)).join('');
      return;
    }

    // HERO: always show hole cards — never hide with "ocultar hasta showdown", never clear on fold/muck
    if (isHero) {
      const cards = (mano.hero_cards && mano.hero_cards.length)
        ? mano.hero_cards
        : (known && known.length ? known : []);
      if (cards.length) {
        box.innerHTML = cards.map(c => renderCarta(c)).join('');
        return;
      }
    }

    if (folded.has(p.name) || mucked.has(p.name)) {
      box.innerHTML = '';
      return;
    }

    // Opponents only: respect "ocultar hasta showdown"
    if (known && known.length && !CONFIG.ocultarHastaShowdown) {
      box.innerHTML = known.map(c => renderCarta(c)).join('');
    } else {
      box.innerHTML = renderCarta('', true) + renderCarta('', true);
    }
  });

  Object.keys(stacks).forEach(name => {
    const el = document.getElementById('player-' + name);
    if (!el) return;
    const badge = el.querySelector('.stack-badge');
    if (badge) badge.textContent = stacks[name] < 0.005 ? 'ALL-IN' : fmtStack(stacks[name], mano.bb);
    if (allinPlayers.has(name)) el.classList.add('allin-player');
  });

  potEl.textContent = 'Bote: ' + fmtPot(Math.max(0, pot), mano.bb);
  boardEl.innerHTML = board.map(c => renderCarta(c)).join('');

  if (ultima?.player) {
    const el = document.getElementById('player-' + ultima.player);
    if (el) {
      el.classList.add('active');
      const tag = el.querySelector('.action-tag');
      if (tag) {
        const isAllin = ultima.type === 'allin' || (allinPlayers.has(ultima.player) && ['bet', 'raise', 'call', 'allin'].includes(ultima.type));
        let txt;
        if (isAllin) {
          txt = 'ALL-IN';
          const total = ultima.to != null ? ultima.to : ultima.amount;
          if (total) txt += ' ' + fmtDinero(total, mano.bb);
          tag.classList.add('allin-tag');
        } else {
          txt = ultima.type.toUpperCase();
          if (ultima.type === 'raise' && ultima.to != null) txt = 'RAISE ' + fmtDinero(ultima.to, mano.bb);
          else if (ultima.amount) txt += ' ' + fmtDinero(ultima.amount, mano.bb);
          tag.classList.remove('allin-tag');
        }
        tag.textContent = txt;
        tag.style.display = 'inline-block';
      }
    }
  }
  if (ultima?.type === 'collect') {
    const el = document.getElementById('player-' + ultima.player);
    if (el) el.classList.add('winner');
  }

  progressFill.style.width = (mano.actions.length ? (hasta / mano.actions.length) * 100 : 0) + '%';

  logEl.innerHTML = '';
  visibles.forEach(a => {
    const d = document.createElement('div');
    let texto = '', cls = '';
    switch (a.type) {
      case 'ante': texto = `${a.player} ante ${fmtDinero(a.amount, mano.bb)}`; break;
      case 'blind': texto = `${a.player} ${a.blind} ${fmtDinero(a.amount, mano.bb)}`; break;
      case 'fold': texto = `${a.player} fold`; cls = 'fold'; break;
      case 'check': texto = `${a.player} check`; break;
      case 'call': texto = `${a.player} call ${fmtDinero(a.amount, mano.bb)}`; cls = 'call'; break;
      case 'bet': texto = `${a.player} bet ${fmtDinero(a.amount, mano.bb)}`; cls = 'bet'; break;
      case 'raise': texto = `${a.player} raise to ${fmtDinero(a.to ?? a.amount, mano.bb)}`; cls = 'raise'; break;
      case 'allin': texto = `⚡ ${a.player} ALL-IN ${fmtDinero(a.to ?? a.amount, mano.bb)}`; cls = 'allin'; break;
      case 'street': texto = `--- ${a.street.toUpperCase()} [${a.board.join(' ')}] ---`; break;
      case 'deal_hole': texto = `Dealt to ${a.player}`; break;
      case 'show': texto = `${a.player} shows [${(a.cards || []).join(' ')}] (${a.desc || ''})`; cls = 'win'; break;
      case 'collect': if (a.pot === 'summary') return; texto = `🏆 ${a.player} wins ${fmtDinero(a.amount, mano.bb)}`; cls = 'win'; break;
      case 'return': texto = `Uncalled ${fmtDinero(a.amount, mano.bb)} to ${a.player}`; break;
      case 'muck': texto = `${a.player} muck`; cls = 'fold'; break;
    }
    d.textContent = texto;
    d.className = cls;
    logEl.appendChild(d);
  });
  logEl.scrollTop = logEl.scrollHeight;
}

/* ═══════════════════════════════════════════════════════
   PLAYBACK
   ═══════════════════════════════════════════════════════ */
function siguientePaso() {
  const mano = manos[manoActual]; if (!mano) return;
  if (pasoActual >= mano.actions.length) {
    detener();
    if (CONFIG.autoSiguienteMano) {
      const pos = manosFiltradas.findIndex(x => x.idx===manoActual);
      if (pos < manosFiltradas.length-1) setTimeout(() => cargarMano(manosFiltradas[pos+1].idx), 350);
    }
    return;
  }
  pasoActual++; renderEstado(aliasMano(mano), pasoActual);
}
function anteriorPaso() { if (pasoActual<=0) return; pasoActual--; renderEstado(aliasMano(manos[manoActual]), pasoActual); }
function reproducir() {
  if (reproduciendo) return;
  reproduciendo = true; $('btnPlay').textContent = '⏸';
  timer = setInterval(() => {
    const mano = manos[manoActual];
    if (!mano || pasoActual >= mano.actions.length) {
      detener();
      if (CONFIG.autoSiguienteMano) {
        const pos = manosFiltradas.findIndex(x => x.idx===manoActual);
        if (pos < manosFiltradas.length-1) setTimeout(() => { cargarMano(manosFiltradas[pos+1].idx); reproducir(); }, 400);
      }
      return;
    }
    siguientePaso();
  }, CONFIG.velocidad);
}
function detener() {
  reproduciendo = false; if (timer) clearInterval(timer); timer = null;
  const b = $('btnPlay'); if (b) b.textContent = '▶';
}
$('btnPlay').onclick = () => reproduciendo ? detener() : reproducir();
$('btnNext').onclick = () => { detener(); siguientePaso(); };
$('btnPrev').onclick = () => { detener(); anteriorPaso(); };
$('btnNextHand').onclick = () => { const pos=manosFiltradas.findIndex(x=>x.idx===manoActual); if(pos<manosFiltradas.length-1) cargarMano(manosFiltradas[pos+1].idx, { suppressScroll: true }); };
$('btnPrevHand').onclick = () => { const pos=manosFiltradas.findIndex(x=>x.idx===manoActual); if(pos>0) cargarMano(manosFiltradas[pos-1].idx, { suppressScroll: true }); };

document.addEventListener('keydown', e => {
  if ($('toolViewer') && $('toolViewer').classList.contains('open')) {
    if (e.key === 'Escape') { e.preventDefault(); closeTool(); }
    return;
  }
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
  if (e.key==='ArrowRight') { e.preventDefault(); detener(); siguientePaso(); }
  if (e.key==='ArrowLeft') { e.preventDefault(); detener(); anteriorPaso(); }
  if (e.key==='ArrowDown') { e.preventDefault(); $('btnNextHand').click(); }
  if (e.key==='ArrowUp') { e.preventDefault(); $('btnPrevHand').click(); }
  if (e.key === ' ') { e.preventDefault(); reproduciendo?detener():reproducir(); }
  if (e.key === 'Escape') {
    if (document.querySelector('.modal-overlay.open')) {
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
      return;
    }
    if ($('sideMenu').classList.contains('open')) { closeMenu(); return; }
  }
});

/* ═══════════════════════════════════════════════════════
   STATS
   ═══════════════════════════════════════════════════════ */
function renderStats() {
  const s = statsActuales;
  if (!s?.hero) {
    statsContainer.innerHTML = '<div style="color:var(--muted);text-align:center;font-size:13px;padding:30px 0;">Sin estadísticas.</div>';
    if (window._hlCharts) {
      Object.values(window._hlCharts).forEach(c => { try { c.destroy(); } catch(_){} });
      window._hlCharts = {};
    }
    return;
  }
  const netoCls = s.neto>=0?'pos':'neg', netoSign = s.neto>=0?'+':'';
  const barras = (s.ultimas_ganancias||[]).map(v => {
    const max = Math.max(...s.ultimas_ganancias.map(x=>Math.abs(x)),1);
    return `<div class="bar ${v<0?'neg':''}" style="height:${Math.max(2,Math.abs(v)/max*38)}px"></div>`;
  }).join('');
  const ORDEN = ['BTN','SB','BB','UTG','UTG+1','MP','LJ','HJ','CO','?'];
  const posKeys = Object.keys(s.por_posicion||{}).sort((a,b)=>(ORDEN.indexOf(a)<0?99:ORDEN.indexOf(a))-(ORDEN.indexOf(b)<0?99:ORDEN.indexOf(b)));
  const posHTML = posKeys.map(pos => {
      const d = s.por_posicion[pos];
      const cls = d.neto_bb>=0?'net-pos':'net-neg';
      const fmt = CONFIG.unidad==='bb' ? d.neto_bb.toFixed(2)+' BB' : d.neto.toFixed(0);
      return `<div class="row"><span>${pos} · ${d.manos}</span><span class="${cls}">${d.neto_bb>=0?'+':''}${fmt}</span></div>`;
    }).join('');
  const netoFmt = CONFIG.unidad==='bb' ? s.neto_bb.toFixed(2)+' BB' : s.neto.toFixed(0);
  let banner = '';
  if (s._filtrado) {
    banner = `<div class="filter-banner"><div><div class="fb-label">Filtro activo</div><div class="fb-count">${s._totalFiltrado} manos</div></div><div class="fb-tag">filtrado</div></div>`;
  }
  const hasChart = typeof Chart !== 'undefined';
  statsContainer.innerHTML = `
    ${banner}
    <div class="stat-block"><div class="label">Hero</div><div class="value" style="color:var(--accent)">${escapeHtml(s.hero)}</div></div>
    <div class="stat-block"><div class="label">Neto${s._filtrado?' (filtrado)':''}</div><div class="value ${netoCls}">${netoSign}${netoFmt}</div></div>
    <div class="stats-grid">
      <div class="mini"><div class="label">Manos</div><div class="value">${s.manos_jugadas}${s.manos_totales && s.manos_totales !== s.manos_jugadas ? `<span style="font-size:10px;color:var(--muted);font-weight:500">/${s.manos_totales}</span>` : ''}</div></div>
      <div class="mini"><div class="label">Ganadas</div><div class="value" style="color:var(--green)">${s.wins}</div></div>
      <div class="mini"><div class="label">Perdidas</div><div class="value" style="color:var(--red)">${s.losses}</div></div>
      <div class="mini"><div class="label">Fold pre</div><div class="value">${s.folds_preflop}</div></div>
      <div class="mini"><div class="label">VPIP</div><div class="value">${s.vpip_pct}%</div></div>
      <div class="mini"><div class="label">PFR</div><div class="value">${s.pfr_pct}%</div></div>
      <div class="mini"><div class="label">3-Bet</div><div class="value">${s.three_bet_pct}%</div></div>
      <div class="mini"><div class="label">WTSD</div><div class="value">${s.wtsd_pct}%</div></div>
    </div>
    ${hasChart ? `
    <div class="stat-block hl-chart-block">
      <div class="label" style="margin-bottom:8px">Resultado (últimas manos)</div>
      <div class="hl-chart-wrap"><canvas id="hlChartNet" height="120"></canvas></div>
    </div>
    <div class="stat-block hl-chart-block">
      <div class="label" style="margin-bottom:8px">Por posición (neto BB)</div>
      <div class="hl-chart-wrap"><canvas id="hlChartPos" height="140"></canvas></div>
    </div>
    <div class="stat-block hl-chart-block">
      <div class="label" style="margin-bottom:8px">Win / Loss</div>
      <div class="hl-chart-wrap" style="max-width:200px;margin:0 auto"><canvas id="hlChartWL" height="140"></canvas></div>
    </div>
    ` : `
    <div class="stat-block"><div class="label">Últimas 20 manos</div><div class="sparkline">${barras||'<span style="color:var(--text-3);font-size:11px">Sin datos</span>'}</div></div>
    `}
    <div class="stat-block"><div class="label" style="margin-bottom:5px">Por posición</div><div class="levels-list">${posHTML||'<div style="color:var(--text-3);font-size:11px">Sin datos</div>'}</div></div>
  `;

  if (hasChart) {
    if (window._hlCharts) {
      Object.values(window._hlCharts).forEach(c => { try { c.destroy(); } catch(_){} });
    }
    window._hlCharts = {};
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const tickColor = isDark ? '#8b93a7' : '#6b7280';
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#f2a83c';
    const green = getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#34d399';
    const red = getComputedStyle(document.documentElement).getPropertyValue('--red').trim() || '#f87171';

    // Cumulative net chart
    const gains = s.ultimas_ganancias || [];
    let cum = 0;
    const cumData = gains.map(v => { cum += v; return Math.round(cum * 100) / 100; });
    const ctxNet = document.getElementById('hlChartNet');
    if (ctxNet && gains.length) {
      window._hlCharts.net = new Chart(ctxNet, {
        type: 'line',
        data: {
          labels: gains.map((_, i) => i + 1),
          datasets: [{
            label: 'Neto acum. BB',
            data: cumData,
            borderColor: accent,
            backgroundColor: accent + '22',
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { display: false, grid: { display: false } },
            y: {
              ticks: { color: tickColor, font: { size: 10 } },
              grid: { color: gridColor },
              border: { display: false }
            }
          }
        }
      });
    }

    // Position bar chart
    const ctxPos = document.getElementById('hlChartPos');
    if (ctxPos && posKeys.length) {
      const posData = posKeys.map(p => s.por_posicion[p].neto_bb);
      const posColors = posData.map(v => v >= 0 ? green : red);
      window._hlCharts.pos = new Chart(ctxPos, {
        type: 'bar',
        data: {
          labels: posKeys,
          datasets: [{
            label: 'Neto BB',
            data: posData,
            backgroundColor: posColors.map(c => c + 'cc'),
            borderColor: posColors,
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: tickColor, font: { size: 10 } }, grid: { display: false } },
            y: {
              ticks: { color: tickColor, font: { size: 10 } },
              grid: { color: gridColor },
              border: { display: false }
            }
          }
        }
      });
    }

    // Win/Loss doughnut
    const ctxWL = document.getElementById('hlChartWL');
    if (ctxWL && (s.wins || s.losses)) {
      window._hlCharts.wl = new Chart(ctxWL, {
        type: 'doughnut',
        data: {
          labels: ['Ganadas', 'Perdidas'],
          datasets: [{
            data: [s.wins, s.losses],
            backgroundColor: [green + 'cc', red + 'cc'],
            borderColor: [green, red],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: tickColor, font: { size: 11 }, boxWidth: 12, padding: 10 }
            }
          },
          cutout: '62%'
        }
      });
    }
  }
}


/* ═══════════════════════════════════════════════════════
   LISTA DE MANOS
   ═══════════════════════════════════════════════════════ */
function renderHandsList(opts = {}) {
  if (!handsList) return;
  const PAGE = 80;
  window._hlListPage = 0;

  const scrollParent = handsList.closest('.scroll-area');

  const wantScrollTop = opts && opts.scrollTop === true;
  if (wantScrollTop && scrollParent) {
    _hlSuppressAutoScroll = true;
    scrollParent.scrollTop = 0;
  } else if (wantScrollTop) {
    _hlSuppressAutoScroll = true;
  }

  if (!manosFiltradas.length) {
    handsList.innerHTML = '<div style="color:var(--muted);text-align:center;font-size:13px;padding:24px 0;">Sin resultados.</div>';
    if (wantScrollTop) {
      setTimeout(() => { _hlSuppressAutoScroll = false; }, 80);
    }
    return;
  }

  function handItemHtml({m, idx}) {
    const resCls = clasificarResultado(m);
    const cls = resCls === 'win' ? 'win' : (resCls === 'loss' ? 'loss' : '');
    const fav = favoritas.has(m.id) ? 'on' : '';
    const netoBB = m.hero_net_bb || 0;
    const netoFmt = CONFIG.unidad === 'bb' ? netoBB.toFixed(2) + ' BB' : (m.hero_net || 0).toFixed(0);
    const sign = (CONFIG.unidad === 'bb' ? netoBB : (m.hero_net || 0)) > 0 ? '+' : '';
    const netCls = (m.hero_net || 0) > 0 ? 'pos' : ((m.hero_net || 0) < 0 ? 'neg' : '');
    const hasNote = notesDB[m.id];
    const heroCards = (m.hero_cards || []).length
      ? `<div class="cards-group"><span class="cards-label">H</span>${m.hero_cards.map(c => renderMiniCarta(c)).join('')}</div>` : '';
    const board = (m.board || []).length
      ? `<div class="cards-group"><span class="cards-label">B</span>${m.board.slice(0, 5).map(c => renderMiniCarta(c)).join('')}</div>` : '';
    const torneoLabel = m.tournamentName || (m.tournament ? `T#${m.tournament}` : '');
    return `<div class="hand-item ${cls}" data-idx="${idx}" data-id="${m.id}">
      <span class="fav ${fav}" data-fav="${m.id}">⭐</span>
      <span class="hand-del" data-del="${m.id}" title="Eliminar mano">🗑️</span>
      <div class="row-top"><span class="hand-idx">#${idx + 1} · ${m.site || '?'}</span><span class="hand-net ${netCls}">${sign}${netoFmt}</span></div>
      <div class="row-meta">
        <span class="badge">Mano ${m.id}</span>
        ${torneoLabel ? `<span class="badge">${escapeHtml(String(torneoLabel).slice(0, 22))}</span>` : ''}
        ${m.winner ? `<span class="badge winner">🏆 ${escapeHtml(String(m.winner).slice(0, 12))}</span>` : ''}
        ${hasNote ? '<span class="badge">📝</span>' : ''}
      </div>
      <div class="row-cards">${heroCards}${board}</div>
    </div>`;
  }

  function paintPage(from, append) {
    const slice = manosFiltradas.slice(from, from + PAGE);
    const htmlChunk = slice.map(handItemHtml).join('');
    if (append) {
      const more = handsList.querySelector('.hl-load-more');
      if (more) more.remove();
      handsList.insertAdjacentHTML('beforeend', htmlChunk);
    } else {
      handsList.innerHTML = htmlChunk;
    }
    const shown = Math.min(from + PAGE, manosFiltradas.length);
    if (shown < manosFiltradas.length) {
      handsList.insertAdjacentHTML('beforeend',
        `<button type="button" class="hl-load-more" style="width:100%;margin:10px 0 4px;padding:12px;border-radius:10px;border:1px solid var(--border);background:var(--panel-2);color:var(--text);font-weight:700;cursor:pointer;">
          Cargar más (${shown} / ${manosFiltradas.length})
        </button>`);
      handsList.querySelector('.hl-load-more').onclick = () => {
        window._hlListPage = (window._hlListPage || 0) + 1;
        paintPage(window._hlListPage * PAGE, true);
        bindHandListEvents();
      };
    }
  }

  function bindHandListEvents() {
    handsList.querySelectorAll('.hand-item').forEach(el => {
      if (el._bound) return;
      el._bound = true;
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-fav]')) return;
        if (e.target.closest('[data-del]')) return;
        const idx = parseInt(el.dataset.idx, 10);
        if (!isNaN(idx) && manos[idx]) {
          detener();
          cargarMano(idx, { scrollCurrent: true });
          if (window.innerWidth <= 959) {
            const mesaBtn = document.querySelector('.tab-btn[data-tab="mesa"]');
            if (mesaBtn) mesaBtn.click();
          }
        }
      });
    });
    handsList.querySelectorAll('[data-fav]').forEach(el => {
      if (el._bound) return;
      el._bound = true;
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = el.dataset.fav;
        try {
          if (favoritas.has(id)) {
            favoritas.delete(id);
            el.classList.remove('on');
            await DB.deleteFavorite(id);
          } else {
            favoritas.add(id);
            el.classList.add('on');
            await DB.putFavorite(id);
          }
        } catch (err) { console.warn('fav', err); }
      });
    });

    handsList.querySelectorAll('[data-del]').forEach(el => {
      if (el._bound) return;
      el._bound = true;
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = el.dataset.del;
        if (!id) return;
        const idx = manos.findIndex(x => x.id === id);
        if (idx < 0) return;
        if (!confirm(`¿Eliminar la mano #${id}?`)) return;
        try {
          await FeltLabAPI.feltlab.deleteHand(id);
          const eraActual = (manoActual === idx);
          manos.splice(idx, 1);
          delete notesDB[id];
          favoritas.delete(id);
          if (eraActual) {
            manoActual = Math.min(idx, manos.length - 1);
            if (manos[manoActual]) cargarMano(manoActual, { suppressScroll: true });
            else {
              detener();
              potEl.textContent = 'Bote: 0';
              boardEl.innerHTML = '';
              logEl.innerHTML = '';
              document.querySelectorAll('.player').forEach(el2 => el2.remove());
              actualizarBanner();
            }
          } else if (manoActual > idx) {
            manoActual--;
          }
          aplicarFiltros();
          renderHandsList({ scrollTop: true });
          renderStats();
          renderFiltros();
          renderNotesList();
          actualizarSessionBadge();
          showToast('Mano eliminada ✓', 'success');
        } catch (err) {
          showToast('Error al eliminar: ' + (err.message || err), 'error');
        }
      });
    });
  }

  paintPage(0, false);
  bindHandListEvents();

  if (!wantScrollTop && typeof manoActual === 'number') {
    handsList.querySelectorAll('.hand-item.current').forEach(e => e.classList.remove('current'));
    const el = handsList.querySelector(`.hand-item[data-idx="${manoActual}"]`);
    if (el) el.classList.add('current');
  } else if (wantScrollTop && scrollParent) {
    requestAnimationFrame(() => {
      scrollParent.scrollTop = 0;
      setTimeout(() => { _hlSuppressAutoScroll = false; }, 80);
    });
  }
}

function markCurrentHand(idx) {
  if (!handsList) return;
  if (_hlSuppressAutoScroll) return;
  handsList.querySelectorAll('.hand-item.current').forEach(e => e.classList.remove('current'));
  const el = handsList.querySelector(`.hand-item[data-idx="${idx}"]`);
  if (el) {
    el.classList.add('current');
    if (!_hlSuppressAutoScroll) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }
}

function resaltarManoEnLista(idx) { markCurrentHand(idx); }

function cargarNotaActual() {
  const mano = manos[manoActual];
  if (!mano) { $('noteText').value=''; document.querySelectorAll('.tag-chip').forEach(c=>c.classList.remove('active')); return; }
  const n = notesDB[mano.id] || { text:'', tags:[] };
  $('noteText').value = n.text || '';
  document.querySelectorAll('.tag-chip').forEach(c => c.classList.toggle('active', (n.tags||[]).includes(c.dataset.tag)));
}
function renderNotesList() {
  const list = $('notesList');
  const entries = Object.entries(notesDB).filter(([,v]) => v.text || (v.tags&&v.tags.length));
  if (!entries.length) {
    list.innerHTML = '<div style="color:var(--muted);font-size:12px;text-align:center;padding:16px 0;">Aún no hay notas.</div>';
    return;
  }
  list.innerHTML = entries.map(([id, n]) => `
    <div class="note-card" data-id="${id}">
      <div class="nc-head"><span class="nc-id">Mano ${id}</span></div>
      <div class="nc-text">${(n.text||'').replace(/</g,'&lt;')}</div>
      <div class="nc-tags">${(n.tags||[]).map(t=>`<span class="nc-tag">${t}</span>`).join('')}</div>
    </div>
  `).join('');
  list.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = manos.findIndex(m => m.id === card.dataset.id);
      if (idx >= 0) {
        const fIdx = manosFiltradas.findIndex(x => x.idx === idx);
        if (fIdx >= 0) cargarMano(idx, { scrollCurrent: true });
        else {
          CONFIG.filtroResultado='all'; CONFIG.filtroAccion='all'; CONFIG.filtroAcciones=[]; CONFIG.filtroJugadas=[]; CONFIG.filtroPosicion=''; CONFIG.filtroTorneo=''; CONFIG.filtroTorneos=[]; CONFIG.listaTorneoActiva=''; CONFIG.filtroSitio=''; CONFIG.busqueda='';
          CONFIG.filtroFechaDesde=''; CONFIG.filtroFechaHasta='';
          guardarYRefrescar(); cargarMano(idx, { suppressScroll: true });
        }
        if (window.innerWidth <= 959) document.querySelector('.tab-btn[data-tab="mesa"]').click();
      }
    });
  });
}
document.querySelectorAll('.tag-chip').forEach(chip => {
  chip.addEventListener('click', () => chip.classList.toggle('active'));
});
$('btnSaveNote').onclick = async () => {
  const mano = manos[manoActual]; if (!mano) return;
  const text = $('noteText').value.trim();
  const tags = [...document.querySelectorAll('.tag-chip.active')].map(c => c.dataset.tag);
  try {
    if (!text && !tags.length) {
      delete notesDB[mano.id];
      await DB.deleteNote(mano.id);
    } else {
      notesDB[mano.id] = { text, tags, updated: Date.now() };
      await DB.putNote({ id: mano.id, text, tags, updated: Date.now() });
    }
    renderNotesList(); renderHandsList();
    const btn = $('btnSaveNote'); btn.textContent = '✓ Guardado'; setTimeout(()=>btn.textContent='Guardar nota',800);
    showToast('Nota guardada ✓', 'success');
  } catch (e) {
    showToast('Error guardando nota', 'error');
  }
};
$('btnClearNote').onclick = () => {
  $('noteText').value = '';
  document.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
};

/* Botón Filtrar → modal de filtros */
const btnOpenFilters = $('btnOpenFilters');
if (btnOpenFilters) btnOpenFilters.addEventListener('click', () => openFiltersModal());
const btnCloseFilters = $('btnCloseFilters');
if (btnCloseFilters) btnCloseFilters.addEventListener('click', () => closeFiltersModal());
const filtersModalEl = $('filtersModal');
if (filtersModalEl) {
  filtersModalEl.addEventListener('click', e => {
    if (e.target === filtersModalEl) closeFiltersModal();
  });
}
document.querySelectorAll('.hl-ftab').forEach(tab => {
  tab.addEventListener('click', () => switchHlFilterTab(tab.dataset.ftab));
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const fm = $('filtersModal');
    if (fm && fm.classList.contains('open')) {
      closeFiltersModal();
      e.preventDefault();
    }
  }
});
/* Búsqueda rápida del toolbar (por si renderFiltros aún no corrió) */
const fSearchQuickInit = $('fSearchQuick');
if (fSearchQuickInit && !fSearchQuickInit._hlBound) {
  fSearchQuickInit._hlBound = true;
  let stQ;
  fSearchQuickInit.addEventListener('input', e => {
    clearTimeout(stQ);
    stQ = setTimeout(() => {
      CONFIG.busqueda = e.target.value;
      const s = $('fSearch');
      if (s && s.value !== e.target.value) s.value = e.target.value;
      guardarYRefrescar(true);
      try { updateHlActiveFilters(); } catch (_) {}
    }, 200);
  });
}

/* ═══════════════════════════════════════════════════════
   MODALES
   ═══════════════════════════════════════════════════════ */
function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }
$('btnCloseImport').onclick = () => closeModal('importModal');
$('importModal').addEventListener('click', e => { if (e.target === $('importModal')) closeModal('importModal'); });
$('btnCloseExport').onclick = () => closeModal('exportModal');
$('exportModal').addEventListener('click', e => { if (e.target === $('exportModal')) closeModal('exportModal'); });
$('btnCloseLibrary').onclick = () => closeModal('libraryModal');
$('libraryModal').addEventListener('click', e => { if (e.target === $('libraryModal')) closeModal('libraryModal'); });
$('btnCloseHelp').onclick = () => closeModal('helpModal');
$('helpModal').addEventListener('click', e => { if (e.target===$('helpModal')) closeModal('helpModal'); });
$('btnCloseSettings').onclick = () => closeModal('settingsModal');
$('settingsModal').addEventListener('click', e => { if (e.target===$('settingsModal')) closeModal('settingsModal'); });
$('btnCloseCredits').onclick = () => closeModal('creditsModal');
$('creditsModal').addEventListener('click', e => { if (e.target===$('creditsModal')) closeModal('creditsModal'); });
$('btnCloseTournament').onclick = () => { closeModal('tournamentModal'); pendingImport = null; };

/* ═══════════════════════════════════════════════════════
   AUTO-CARGA DESDE SERVIDOR
   ═══════════════════════════════════════════════════════ */
const LOGS_DIR = 'logs/';
let autoLogsFiles = [];
let autoCargando = false;

async function descubrirLogsServidor(silencioso = false) {
  const statusText = $('autoStatusText');
  const list = $('autoLogsList');
  if (!statusText || !list) return;

  statusText.innerHTML = '🌐 Servidor: buscando <code>logs/index.json</code>…';
  list.innerHTML = '';
  autoLogsFiles = [];

  let nombres = [];
  try {
    const r = await fetch(LOGS_DIR + 'index.json?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) {
      const arr = await r.json();
      if (Array.isArray(arr)) nombres = arr.map(String);
    }
  } catch {}

  if (!nombres.length) {
    try {
      const r = await fetch(LOGS_DIR, { cache: 'no-store' });
      if (r.ok) {
        const html = await r.text();
        const re = /href="([^"]+\.(?:txt|log))"/gi;
        const set = new Set(); let m;
        while ((m = re.exec(html)) !== null) {
          const name = decodeURIComponent(m[1].split('/').pop());
          if (name) set.add(name);
        }
        nombres = [...set];
      }
    } catch {}
  }

  if (!nombres.length) {
    statusText.innerHTML = '⚠️ No hay <code>logs/index.json</code> ni listado disponible. Carga manual.';
    return;
  }

  autoLogsFiles = nombres.map(n => ({ name: n, url: LOGS_DIR + n }));
  const cargados = new Set(archivosCargados.map(a => a.name));

  statusText.innerHTML = `🌐 Servidor: <strong>${autoLogsFiles.length}</strong> archivo(s) en <code>logs/</code>`;
  list.innerHTML = autoLogsFiles.map(f => {
    const ya = cargados.has(f.name);
    return `<div class="auto-log-item ${ya?'loaded':''}">
      <span class="al-name">📄 ${f.name}</span>
      <span class="al-state">${ya?'✓ cargado':'pendiente'}</span>
    </div>`;
  }).join('');

  if (!silencioso && autoLogsFiles.length) {
    const pendientes = autoLogsFiles.filter(f => !cargados.has(f.name));
    if (pendientes.length && !autoCargando) await cargarDesdeServidor(pendientes);
  }
}

async function cargarDesdeServidor(items) {
  if (autoCargando || !items.length) return;
  autoCargando = true;
  const statusText = $('autoStatusText');
  if (statusText) statusText.innerHTML = `⏳ Cargando ${items.length} archivo(s)…`;

  const resultados = [];
  for (const it of items) {
    try {
      const r = await fetch(it.url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      let hands = [];
      try { hands = parsePokerLog(text); } catch (err) {}
      hands.forEach(h => {
        h.sourceFile = it.name;
        if (h.site === 'acr' && (!h.tournamentName || h.tournamentName.startsWith('Torneo '))) {
          const tn = extraerNombreTorneoDeArchivo(it.name);
          if (tn) h.tournamentName = tn;
        }
      });
      resultados.push({ name: it.name, hands, error: null });
    } catch (e) {
      resultados.push({ name: it.name, hands: [], error: e.message || 'fetch error' });
    }
  }

  const todasLasManos = [];
  const errores = [];
  for (const r of resultados) {
    if (r.error) { errores.push(`"${r.name}": ${r.error}`); continue; }
    if (!r.hands.length) { errores.push(`"${r.name}": sin manos válidas`); continue; }
    todasLasManos.push(...r.hands);
  }

  if (todasLasManos.length) {
    const grupos = new Map();
    for (const h of todasLasManos) {
      const key = h.tournament ? `${h.site}::${h.tournament}` : `${h.site}::_cash_::${h.sourceFile||'sin-archivo'}`;
      if (!grupos.has(key)) {
        grupos.set(key, {
          key, site: h.site, tournamentId: h.tournament || null,
          tournamentName: h.tournamentName || (h.tournament ? `Torneo ${h.tournament}` : 'Sin torneo'),
          hands: [], earliest: h.date || '', files: new Set()
        });
      }
      const g = grupos.get(key);
      g.hands.push(h);
      if (h.sourceFile) g.files.add(h.sourceFile);
      if (h.date && (!g.earliest || h.date < g.earliest)) g.earliest = h.date;
    }
    if (grupos.size > 1) {
      pendingImport = { grupos, resultados, errores, totalManos: todasLasManos.length };
      mostrarTournamentPicker(grupos);
    } else {
      await importarGrupos([...grupos.values()], resultados, errores);
    }
  }

  if (statusText) {
    statusText.innerHTML = `✅ Servidor: <strong>${autoLogsFiles.length}</strong> archivo(s) · ${manos.length} manos`;
    if (errores.length) statusText.innerHTML += `<br><span style="color:var(--amber)">⚠ ${errores.length} con problemas</span>`;
  }
  autoCargando = false;
}

$('btnReloadLogs')?.addEventListener('click', () => descubrirLogsServidor(false));

/* ═══════════════════════════════════════════════════════
   EXPORTAR / IMPORTAR SESIÓN
   ═══════════════════════════════════════════════════════ */
function _siteKey(h) {
  return String(h.site || h.Source || '').toLowerCase();
}
function isCoinPokerHand(h) {
  const s = _siteKey(h);
  return s.includes('coin');
}
function isAcrHand(h) {
  const s = _siteKey(h);
  if (isCoinPokerHand(h)) return false;
  return !s || s.includes('acr') || s.includes('wpn') || s.includes('winning') || s === 'unknown' || s === 'feltlab';
}

async function serializarSesion(scope = 'all') {
  let hands = manos.slice();
  if (!hands.length) {
    hands = await DB.allHands().catch(() => []);
  }
  if (scope === 'acr') {
    hands = hands.filter(isAcrHand);
  } else if (scope === 'coinpoker') {
    hands = hands.filter(isCoinPokerHand);
  } else if (scope === 'filtered') {
    hands = (manosFiltradas || []).map(x => x.m || x.mano || x).filter(h => h && h.id);
    if (!hands.length && typeof manosConFiltros === 'function') {
      hands = manosConFiltros();
    }
  }

  const idSet = new Set(hands.map(h => h.id));
  const notes = Object.entries(notesDB)
    .filter(([id]) => idSet.has(id))
    .map(([id, n]) => ({ id, ...(n || {}) }));
  const favs = [...favoritas].filter(id => idSet.has(id));

  return {
    version: 'feltlab-session-v5',
    fecha: new Date().toISOString(),
    user: currentUser ? currentUser.username : null,
    exportScope: scope,
    manos: hands,
    archivosCargados: archivosCargados.map(a => ({
      name: a.name, handsCount: a.handsCount, tournaments: [...(a.tournaments || [])], site: a.site
    })),
    favoritas: favs,
    notas: Object.fromEntries(notes.map(n => [n.id, { text: n.text || '', tags: n.tags || [], updated: n.updated || 0 }])),
    config: CONFIG
  };
}

async function exportarSesion() {
  const scopeEl = document.querySelector('input[name="exportScope"]:checked');
  const scope = (scopeEl && scopeEl.value) || 'all';
  if (!manos.length && !Object.keys(notesDB).length && !favoritas.size) {
    showToast('No hay nada que exportar', 'error');
    return;
  }
  if (scope === 'filtered' && (!manosFiltradas || !manosFiltradas.length)) {
    showToast('No hay manos con los filtros actuales', 'error');
    return;
  }
  const data = await serializarSesion(scope);
  if (!data.manos.length) {
    showToast('Ninguna mano coincide con esa selección', 'error');
    return;
  }
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fecha = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const tag = scope === 'all' ? 'todas' : scope === 'filtered' ? 'filtradas' : scope;
  let name = ($('exportFileName') && $('exportFileName').value.trim()) || `feltlab-${tag}-${fecha}`;
  name = name.replace(/\.json$/i, '').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ.]+/g, '_');
  if (!name) name = `feltlab-${tag}-${fecha}`;
  a.href = url;
  a.download = name + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  const info = $('exportInfo');
  if (info) {
    info.textContent = `✓ Exportado (${tag}): ${data.manos.length} manos, ${data.favoritas.length} favoritas, ${Object.keys(data.notas).length} notas`;
    setTimeout(() => { info.textContent = ''; }, 6000);
  }
  showToast(`Exportadas ${data.manos.length} manos ✓`, 'success');
  setTimeout(() => closeModal('exportModal'), 800);
}

async function importarSesion(file) {
  const info = $('importInfo');
  if (info) info.textContent = '⏳ Leyendo archivo…';
  const replace = !!($('importReplaceCheck') && $('importReplaceCheck').checked);
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.manos)) throw new Error('Formato no reconocido');

    if (replace) {
      if (!confirm('¿Reemplazar todas las manos actuales por las del archivo? No se puede deshacer.')) {
        if (info) info.textContent = '';
        return;
      }
      setLoading(true);
      await DB.clearAll();
      manos = []; manosFiltradas = []; archivosCargados = [];
      favoritas.clear(); notesDB = {};
      manoActual = 0; pasoActual = 0;
    }

    const ids = new Set(manos.map(m => m.id));
    const nuevas = [];
    for (const m of data.manos) {
      if (m && m.id && !ids.has(m.id)) { nuevas.push(m); ids.add(m.id); }
    }

    const inserted = await DB.putHands(nuevas);

    const notasEntrantes = Object.entries(data.notas || {});
    for (const [id, n] of notasEntrantes) {
      if (replace || !notesDB[id]) {
        notesDB[id] = n;
        try { await DB.putNote({ id, text: n.text || '', tags: n.tags || [], updated: n.updated || Date.now() }); } catch {}
      }
    }

    for (const id of (data.favoritas || [])) {
      if (replace || !favoritas.has(id)) { favoritas.add(id); try { await DB.putFavorite(id); } catch {} }
    }

    if (replace) {
      archivosCargados = [];
    }
    const nombres = new Set(archivosCargados.map(a => a.name));
    for (const a of (data.archivosCargados || [])) {
      if (a && a.name && !nombres.has(a.name)) {
        archivosCargados.push({
          name: a.name,
          handsCount: a.handsCount || 0,
          tournaments: new Set(a.tournaments || []),
          site: a.site || 'unknown'
        });
        nombres.add(a.name);
      }
    }
    await DB.metaSet('files', archivosCargados.map(a => ({
      name: a.name, handsCount: a.handsCount, tournaments: [...a.tournaments], site: a.site
    })));

    if (data.config && typeof data.config === 'object') {
      CONFIG = { ...CONFIG, ...data.config };
      saveConfig();
    }

    await cargarTodoDesdeDB();
    if (info) info.textContent = replace
      ? `✓ Reemplazado: ${manos.length} manos`
      : `✓ Importado: +${inserted} manos · total ${manos.length}`;
    showToast(replace ? `Sesión reemplazada · ${manos.length} manos ✓` : `Agregadas ${inserted} manos ✓`, 'success');
    setTimeout(() => closeModal('importModal'), 800);
  } catch (err) {
    if (info) info.textContent = `❌ Error: ${err.message}`;
    showToast('Error al importar', 'error');
  } finally {
    setLoading(false);
  }
}

async function reiniciarTodo() {
  if (!confirm('¿Borrar TODOS los datos? No se puede deshacer.')) return;
  detener();
  setLoading(true);
  try {
    await DB.clearAll();
    manos = []; manosFiltradas = []; archivosCargados = []; statsActuales = null;
    manoActual = 0; pasoActual = 0;
    favoritas.clear(); notesDB = {};
    CONFIG = { ...DEFAULT_CONFIG };
    saveConfig();

    potEl.textContent = 'Bote: 0'; boardEl.innerHTML = ''; logEl.innerHTML = '';
    if (infoEl) infoEl.textContent = ''; progressFill.style.width = '0%';
    document.querySelectorAll('.player').forEach(e => e.remove());
    actualizarBanner();
    const fi = $('fileInfo');
    if (fi) { fi.textContent = 'Sin archivos cargados'; fi.classList.remove('error'); fi.style.color = 'var(--green)'; }

    aplicarFiltros(); renderStats(); renderHandsList({ scrollTop: true }); renderFiltros(); renderNotesList();
    actualizarSessionBadge(); renderSettings();
    const info = $('importInfo');
    if (info) { info.textContent = '✓ Datos borrados'; setTimeout(()=>info.textContent='',3000); }
    showToast('Datos borrados ✓', 'success');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  } finally {
    setLoading(false);
  }
}

$('btnImportSession').onclick = () => $('importSessionInput').click();
$('importSessionInput').onchange = e => {
  const f = e.target.files[0];
  if (f) importarSesion(f);
  e.target.value = '';
};
$('btnExportSession').onclick = exportarSesion;
$('btnPublishLibrary') && ($('btnPublishLibrary').onclick = publishToLibrary);

/* ═══════════════════════════════════════════════════════
   BIBLIOTECA
   ═══════════════════════════════════════════════════════ */
async function refreshLibraryList() {
  const box = $('libraryList');
  if (!box) return;
  box.innerHTML = '<div style="font-size:11px;color:var(--muted);text-align:center;padding:14px 0;">Cargando…</div>';
  try {
    const packs = await FeltLabAPI.library.list();
    if (!packs || !packs.length) {
      box.innerHTML = '<div style="font-size:11px;color:var(--muted);text-align:center;padding:14px 0;">Aún no hay packs públicos.</div>';
      return;
    }
    box.innerHTML = packs.map(p => {
      const types = (p.tournamentTypes || []).slice(0, 4).join(' · ') || 'MTT';
      const mine = p.isOwner ? ' · <span style="color:var(--accent)">tuyo</span>' : '';
      return `<div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px;">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
          <div style="min-width:0;">
            <div style="font-size:12px;font-weight:700;">${escapeHtml(p.title)}</div>
            <div style="font-size:10px;color:var(--muted);margin-top:2px;">
              @${escapeHtml(p.username || p.owner || '')} · ${p.handCount} manos · ${p.tourneyCount} torneos · ${escapeHtml(p.siteLabel || '')}${mine}
            </div>
            <div style="font-size:10px;color:var(--text-2);margin-top:4px;">${escapeHtml(types)}</div>
            ${p.description ? `<div style="font-size:10px;color:var(--muted);margin-top:4px;">${escapeHtml(p.description)}</div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
            <button class="btn btn-primary" style="padding:6px 10px;font-size:11px;" data-lib-import="${p.id}">Importar</button>
            ${p.isOwner ? `<button class="btn btn-secondary" style="padding:6px 10px;font-size:11px;color:var(--red);" data-lib-del="${p.id}">Borrar</button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');

    box.querySelectorAll('[data-lib-import]').forEach(btn => {
      btn.onclick = async () => {
        const id = +btn.dataset.libImport;
        btn.disabled = true;
        btn.textContent = '…';
        try {
          const r = await FeltLabAPI.library.import(id);
          showToast(`Importadas ${r.inserted || 0} manos de «${r.packTitle || 'pack'}»`, 'success');
          await cargarTodoDesdeDB();
        } catch (e) {
          showToast(e.message || 'Error al importar', 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = 'Importar';
        }
      };
    });
    box.querySelectorAll('[data-lib-del]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('¿Borrar este pack de la biblioteca?')) return;
        try {
          await FeltLabAPI.library.remove(+btn.dataset.libDel);
          showToast('Pack eliminado', 'success');
          refreshLibraryList();
        } catch (e) {
          showToast(e.message || 'Error', 'error');
        }
      };
    });
  } catch (e) {
    box.innerHTML = `<div style="font-size:11px;color:var(--red)">Error: ${escapeHtml(e.message || e)}</div>`;
  }
}

async function publishToLibrary() {
  const title = ($('libTitle') && $('libTitle').value || '').trim();
  const desc = ($('libDesc') && $('libDesc').value || '').trim();
  const scopeEl = document.querySelector('input[name="libScope"]:checked');
  let scope = (scopeEl && scopeEl.value) || 'acr';
  const info = $('libPublishInfo');
  if (!title) {
    showToast('Pon un título al pack', 'error');
    return;
  }
  let handIds = null;
  if (scope === 'filtered') {
    const list = (manosFiltradas || []).map(x => (x.m || x).id).filter(Boolean);
    if (!list.length) {
      showToast('No hay manos con los filtros actuales', 'error');
      return;
    }
    handIds = list;
    scope = 'all';
  }
  if (info) info.textContent = 'Publicando…';
  try {
    const r = await FeltLabAPI.library.publish({
      title, description: desc, scope, handIds
    });
    if (info) info.textContent = `✓ Publicado: ${r.handCount} manos`;
    showToast('Pack publicado en la biblioteca', 'success');
    if ($('libTitle')) $('libTitle').value = '';
    if ($('libDesc')) $('libDesc').value = '';
    await refreshLibraryList();
  } catch (e) {
    if (info) info.textContent = '';
    showToast(e.message || 'Error al publicar', 'error');
  }
}

/* ═══════════════════════════════════════════════════════
   AJUSTES
   ═══════════════════════════════════════════════════════ */
async function renderSettings() {
  const body = $('settingsBody');
  if (!body) return;
  const totalDB = manos.length;
  body.innerHTML = `
    <div class="settings-section">
      <h4>Tus datos</h4>
      <div class="db-info-box">
        🗄️ <strong>${totalDB}</strong> manos cargadas · <strong>${archivosCargados.length}</strong> torneo(s) · <strong>${favoritas.size}</strong> favoritas · <strong>${Object.keys(notesDB).length}</strong> notas
      </div>
    </div>
    <div class="settings-section">
      <h4>Visualización</h4>
      <div class="setting-row">
        <div><div class="setting-label">Unidad</div><div class="setting-desc">Fichas o Big Blinds</div></div>
        <div class="seg-switch" id="cfgUnit">
          <button data-unit="chips" class="${CONFIG.unidad==='chips'?'active':''}">Fichas</button>
          <button data-unit="bb" class="${CONFIG.unidad==='bb'?'active':''}">BB</button>
        </div>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Ocultar hasta showdown</div><div class="setting-desc">Cartas ocultas hasta el final</div></div>
        <div class="switch ${CONFIG.ocultarHastaShowdown?'on':''}" id="cfgOcultar"></div>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Nombres bonitos</div><div class="setting-desc">Renombrar hashes de CoinPoker</div></div>
        <div class="switch ${CONFIG.nombresBonitos?'on':''}" id="cfgNombres"></div>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Sonido</div><div class="setting-desc">Efectos de audio</div></div>
        <div class="switch ${CONFIG.sonidoActivo?'on':''}" id="cfgSonido"></div>
      </div>
    </div>
    <div class="settings-section">
      <h4>Tamaño en la mesa</h4>
      <div class="setting-row">
        <div><div class="setting-label">Cartas del board</div><div class="setting-desc">Tamaño de las cartas de la mesa</div></div>
        <input type="range" id="cfgBoardScale" min="0.4" max="1.5" step="0.05" value="${CONFIG.boardScale}">
        <span class="range-value" id="cfgBoardScaleVal">${Math.round(CONFIG.boardScale*100)}%</span>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Cartas de manos</div><div class="setting-desc">Tamaño de las cartas de los jugadores</div></div>
        <input type="range" id="cfgCardScale" min="0.4" max="1.5" step="0.05" value="${CONFIG.cardScale}">
        <span class="range-value" id="cfgCardScaleVal">${Math.round(CONFIG.cardScale*100)}%</span>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Fuente de jugadores</div><div class="setting-desc">Nombre, stack y avatar</div></div>
        <input type="range" id="cfgPlayerFontScale" min="0.5" max="1.5" step="0.05" value="${CONFIG.playerFontScale}">
        <span class="range-value" id="cfgPlayerFontScaleVal">${Math.round(CONFIG.playerFontScale*100)}%</span>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Bote</div><div class="setting-desc">Tamaño del texto del bote</div></div>
        <input type="range" id="cfgPotScale" min="0.5" max="1.5" step="0.05" value="${CONFIG.potScale}">
        <span class="range-value" id="cfgPotScaleVal">${Math.round(CONFIG.potScale*100)}%</span>
      </div>
    </div>
    <div class="settings-section">
      <h4>Reproducción</h4>
      <div class="setting-row">
        <div><div class="setting-label">Velocidad</div><div class="setting-desc">ms por paso</div></div>
        <input type="range" id="cfgVel" min="200" max="2000" step="100" value="${CONFIG.velocidad}">
        <span class="range-value" id="cfgVelVal">${CONFIG.velocidad}ms</span>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Saltar antes</div><div class="setting-desc">Empezar al repartir cartas al hero</div></div>
        <div class="switch ${CONFIG.saltarAntes?'on':''}" id="cfgSaltar"></div>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Auto siguiente mano</div><div class="setting-desc">Avanzar al terminar</div></div>
        <div class="switch ${CONFIG.autoSiguienteMano?'on':''}" id="cfgAuto"></div>
      </div>
    </div>
    <div class="settings-section">
      <h4>Datos</h4>
      <div class="setting-row">
        <div><div class="setting-label">Vaciar manos</div><div class="setting-desc">${manos.length} en memoria · ${totalDB} en servidor</div></div>
        <button class="btn btn-secondary" style="flex:0;padding:7px 12px;font-size:11px" id="cfgClearHands">Vaciar</button>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Limpiar favoritas</div><div class="setting-desc">${favoritas.size} marcadas</div></div>
        <button class="btn btn-secondary" style="flex:0;padding:7px 12px;font-size:11px" id="cfgClearFavs">Limpiar</button>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Borrar todo</div><div class="setting-desc">Manos, notas y favoritas</div></div>
        <button class="btn btn-secondary" style="flex:0;padding:7px 12px;font-size:11px;color:var(--red)" id="cfgReset">Borrar</button>
      </div>
    </div>
  `;
  body.querySelectorAll('#cfgUnit button').forEach(btn => {
    btn.onclick = async () => {
      CONFIG.unidad = btn.dataset.unit;
      body.querySelectorAll('#cfgUnit button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); await saveConfig();
      aplicarFiltros(); renderHandsList(); renderStats(); renderFiltros();
      if (manos.length) renderEstado(aliasMano(manos[manoActual]), pasoActual);
      actualizarBanner();
    };
  });
  $('cfgOcultar').onclick = async e => { CONFIG.ocultarHastaShowdown=!CONFIG.ocultarHastaShowdown; e.target.classList.toggle('on',CONFIG.ocultarHastaShowdown); await saveConfig(); if(manos.length) renderEstado(aliasMano(manos[manoActual]),pasoActual); };
  $('cfgNombres').onclick = async e => {
    CONFIG.nombresBonitos = !CONFIG.nombresBonitos;
    e.target.classList.toggle('on', CONFIG.nombresBonitos);
    await saveConfig();
    if (manos.length) cargarMano(manoActual, { suppressScroll: true });
    renderHandsList();
    renderStats();
    renderFiltros();
  };
  $('cfgSonido').onclick = async e => { CONFIG.sonidoActivo=!CONFIG.sonidoActivo; e.target.classList.toggle('on',CONFIG.sonidoActivo); await saveConfig(); };
  $('cfgVel').oninput = async e => { CONFIG.velocidad=+e.target.value; $('cfgVelVal').textContent=CONFIG.velocidad+'ms'; await saveConfig(); if(reproduciendo){detener();reproducir();} };
  $('cfgSaltar').onclick = async e => { CONFIG.saltarAntes=!CONFIG.saltarAntes; e.target.classList.toggle('on',CONFIG.saltarAntes); await saveConfig(); if(manos.length) cargarMano(manoActual, { suppressScroll: true }); };
  $('cfgAuto').onclick = async e => { CONFIG.autoSiguienteMano=!CONFIG.autoSiguienteMano; e.target.classList.toggle('on',CONFIG.autoSiguienteMano); await saveConfig(); };

  $('cfgBoardScale').oninput = e => {
    CONFIG.boardScale = +e.target.value;
    $('cfgBoardScaleVal').textContent = Math.round(CONFIG.boardScale*100) + '%';
    applyVisualVars();
    saveLocalConfig();
  };
  $('cfgCardScale').oninput = e => {
    CONFIG.cardScale = +e.target.value;
    $('cfgCardScaleVal').textContent = Math.round(CONFIG.cardScale*100) + '%';
    applyVisualVars();
    saveLocalConfig();
  };
  $('cfgPlayerFontScale').oninput = e => {
    CONFIG.playerFontScale = +e.target.value;
    $('cfgPlayerFontScaleVal').textContent = Math.round(CONFIG.playerFontScale*100) + '%';
    applyVisualVars();
    saveLocalConfig();
  };
  $('cfgPotScale').oninput = e => {
    CONFIG.potScale = +e.target.value;
    $('cfgPotScaleVal').textContent = Math.round(CONFIG.potScale*100) + '%';
    applyVisualVars();
    saveLocalConfig();
  };

  $('cfgClearHands').onclick = async () => {
    if (!manos.length) return;
    if (!confirm('¿Vaciar todas las manos?')) return;
    detener();
    setLoading(true);
    try {
      await DB.clearHands();
      await DB.metaSet('files', []);
      manos = []; manosFiltradas = []; archivosCargados = []; statsActuales = null;
      manoActual = 0; pasoActual = 0;
      potEl.textContent = 'Bote: 0'; boardEl.innerHTML = ''; logEl.innerHTML = '';
      if (infoEl) infoEl.textContent = ''; progressFill.style.width = '0%';
      document.querySelectorAll('.player').forEach(e => e.remove());
      actualizarBanner();
      aplicarFiltros(); renderStats(); renderHandsList({ scrollTop: true }); renderFiltros(); renderNotesList();
      actualizarSessionBadge(); await renderSettings();
      showToast('Manos vaciadas ✓', 'success');
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };
  $('cfgClearFavs').onclick = async () => {
    if (!favoritas.size) return;
    if (!confirm('¿Eliminar todas las favoritas?')) return;
    try {
      await DB.clearFavorites();
      favoritas.clear();
      renderHandsList(); aplicarFiltros(); renderFiltros(); await renderSettings();
      showToast('Favoritas eliminadas ✓', 'success');
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  };
  $('cfgReset').onclick = async () => {
    if (!confirm('¿Borrar TODOS los datos? No se puede deshacer.')) return;
    await reiniciarTodo();
    await renderSettings();
  };
}

async function saveConfig() {
  saveLocalConfig();
  applyVisualVars();
  try {
    const { busqueda, ...rest } = CONFIG;
    await DB.configSet({ ...rest, busqueda: '' });
  } catch (e) { console.warn('No se pudo guardar config en servidor:', e); }
}

async function doLogout() {
  if (!confirm('¿Cerrar sesión?')) return;
  try { await FeltLabAPI.auth.logout(); } catch {}
  window.location.href = '/login';
}

/* ═══════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════ */
(async function init() {
  document.body.dataset.tab = 'mesa';
  const localCfg = loadLocalConfig();
  if (localCfg) CONFIG = { ...CONFIG, ...localCfg };
  if (!(CONFIG.cardScale > 0)) CONFIG.cardScale = 1;
  if (!(CONFIG.boardScale > 0)) CONFIG.boardScale = 1;
  if (!(CONFIG.playerFontScale > 0)) CONFIG.playerFontScale = 1;
  if (!(CONFIG.potScale > 0)) CONFIG.potScale = 1;
  if (!(CONFIG.nameScale > 0)) CONFIG.nameScale = 1;
  applyVisualVars();

  renderFiltros();
  renderNotesList();
  actualizarSessionBadge();
  aplicarSidePanel();

  const ok = await loadUser();
  if (!ok) return;

  try {
    await cargarTodoDesdeDB();
  } catch (e) {
    console.error('Error cargando DB:', e);
    setConnStatus('offline', 'Offline');
  }

  setInterval(() => { pingServer().catch(() => {}); }, 60000);
})();

window.addEventListener('offline', () => setConnStatus('offline', 'Offline'));
window.addEventListener('online', () => {
  setConnStatus('online', 'Online');
  pingServer().catch(() => {});
});
