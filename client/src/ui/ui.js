// Toàn bộ thao tác với giao diện HTML: menu, phòng chờ, HUD, bảng điểm.
import { TEAM_NAMES } from '../config.js';
import { WEAPONS, WEAPON_ORDER } from '../weapons/weapons.js';

const $ = (id) => document.getElementById(id);

const el = {
  menu: $('menu'), lobby: $('lobby'), hud: $('hud'), scoreboard: $('scoreboard'), clickplay: $('clickplay'),
  nick: $('nick'), serverUrl: $('serverUrl'), serverMode: $('serverMode'), serverLabel: $('serverLabel'), serverHint: $('serverHint'), sens: $('sens'), sensVal: $('sensVal'),
  btnCreate: $('btnCreate'), btnJoin: $('btnJoin'), pin: $('pin'), menuStatus: $('menuStatus'), btnCancel: $('btnCancel'),
  lobbyPin: $('lobbyPin'), lobbyPing: $('lobbyPing'), listA: $('listA'), listB: $('listB'),
  countA: $('countA'), countB: $('countB'), joinA: $('joinA'), joinB: $('joinB'),
  lobbyMsg: $('lobbyMsg'), btnStart: $('btnStart'), btnLeave: $('btnLeave'),
  aliveA: $('aliveA'), aliveB: $('aliveB'), scoreA: $('scoreA'), scoreB: $('scoreB'),
  roundlabel: $('roundlabel'), timer: $('timer'), killfeed: $('killfeed'), hitmarker: $('hitmarker'),
  vignette: $('vignette'), banner: $('banner'), spectate: $('spectate'), pingbox: $('pingbox'),
  hp: $('hp'), wname: $('wname'), ammo: $('ammo'), weaponbar: $('weaponbar'),
  quality: $('quality'), stats: $('stats'), crosshair: $('crosshair'), dmgdir: $('dmgdir'), pops: $('pops'),
};

// Chỉ cập nhật DOM khi giá trị thật sự đổi.
function setText(node, value) {
  const v = String(value);
  if (node._v !== v) {
    node._v = v;
    node.textContent = v;
  }
}

function setClass(node, cls, on) {
  node.classList.toggle(cls, !!on);
}

let bannerTimer = 0;
let hitTimer = 0;
let vigTimer = 0;
let dirTimer = 0;

export const ui = {
  el,

  showScreen(name) {
    el.menu.classList.toggle('hidden', name !== 'menu');
    el.lobby.classList.toggle('hidden', name !== 'lobby');
    el.hud.classList.toggle('hidden', name !== 'game');
    if (name !== 'game') {
      el.scoreboard.classList.add('hidden');
      el.clickplay.classList.add('hidden');
    }
  },

  // ----- Menu -----
  setMenuStatus(text, kind = '') {
    el.menuStatus.textContent = text || '';
    el.menuStatus.className = 'status ' + kind;
  },

  setBusy(busy) {
    el.btnCreate.disabled = busy;
    el.btnJoin.disabled = busy;
    el.btnCancel.classList.toggle('hidden', !busy);
  },

  // ----- Phòng chờ -----
  setLobbyMsg(text, kind = '') {
    el.lobbyMsg.textContent = text || '';
    el.lobbyMsg.className = 'status ' + kind;
  },

  renderLobby(room, meId, ping) {
    if (!room) return;
    el.lobbyPin.textContent = room.pin;
    el.lobbyPing.textContent = ping ? `Ping ${ping} ms` : '';
    const fill = (listEl, team) => {
      listEl.textContent = '';
      let n = 0;
      for (const p of room.players) {
        if (p.team !== team) continue;
        n++;
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = p.name;
        li.appendChild(name);
        const tag = document.createElement('span');
        tag.className = 'tag';
        const tags = [];
        if (p.id === room.host) tags.push('CHỦ PHÒNG');
        if (!p.on) tags.push('MẤT KẾT NỐI');
        tag.textContent = tags.join(' · ');
        li.appendChild(tag);
        if (p.id === meId) li.classList.add('me');
        if (!p.on) li.classList.add('off');
        listEl.appendChild(li);
      }
      return n;
    };
    const a = fill(el.listA, 'A');
    const b = fill(el.listB, 'B');
    el.countA.textContent = `${a}/5`;
    el.countB.textContent = `${b}/5`;
    const me = room.players.find((p) => p.id === meId);
    el.joinA.disabled = !me || me.team === 'A' || a >= 5;
    el.joinB.disabled = !me || me.team === 'B' || b >= 5;
    const isHost = room.host === meId;
    el.btnStart.disabled = !isHost;
    el.btnStart.textContent = isHost ? 'Bắt đầu trận' : 'Chờ chủ phòng bắt đầu...';
  },

  // ----- HUD -----
  setHp(hp) {
    setText(el.hp, Math.max(0, Math.round(hp)));
    setClass(el.hp, 'low', hp <= 30);
  },

  setAmmo(self) {
    const w = WEAPONS[self.weapon];
    const a = self.ammo[self.weapon] || [0, 0];
    setText(el.wname, w ? w.name : '');
    if (self.reloading) {
      setText(el.ammo, 'THAY ĐẠN...');
    } else {
      setText(el.ammo, `${a[0]} / ${a[1]}`);
    }
    setClass(el.ammo, 'reloading', self.reloading);
    if (!el.weaponbar._built) {
      el.weaponbar._built = true;
      for (const id of WEAPON_ORDER) {
        const s = document.createElement('span');
        s.dataset.id = id;
        s.textContent = `${WEAPONS[id].slot} ${WEAPONS[id].name}`;
        el.weaponbar.appendChild(s);
      }
    }
    for (const s of el.weaponbar.children) setClass(s, 'on', s.dataset.id === self.weapon);
  },

  setScore(a, b) {
    setText(el.scoreA, a);
    setText(el.scoreB, b);
  },

  setAlive(a, b) {
    setText(el.aliveA, a);
    setText(el.aliveB, b);
  },

  setRoundLabel(text) {
    setText(el.roundlabel, text);
  },

  setTimer(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    setText(el.timer, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
  },

  setPing(rtt) {
    setText(el.pingbox, rtt ? `Ping ${rtt} ms` : '');
  },

  banner(text, small = '', cls = '', ms = 2500) {
    el.banner.textContent = '';
    el.banner.className = cls;
    el.banner.appendChild(document.createTextNode(text));
    if (small) {
      const s = document.createElement('small');
      s.textContent = small;
      el.banner.appendChild(s);
    }
    el.banner.style.display = '';
    clearTimeout(bannerTimer);
    if (ms > 0) bannerTimer = setTimeout(() => { el.banner.style.display = 'none'; }, ms);
  },

  hideBanner() {
    clearTimeout(bannerTimer);
    el.banner.style.display = 'none';
  },

  setSpectate(text) {
    setText(el.spectate, text || '');
  },

  hitmarker(kill, head) {
    el.hitmarker.classList.add('show');
    setClass(el.hitmarker, 'kill', kill);
    setClass(el.hitmarker, 'head', head && !kill);
    clearTimeout(hitTimer);
    hitTimer = setTimeout(() => el.hitmarker.classList.remove('show'), head ? 140 : 90);
  },

  // Số sát thương nổi lên cạnh tâm ngắm.
  damagePop(dmg, head) {
    const s = document.createElement('span');
    s.textContent = String(dmg);
    if (head) s.classList.add('head');
    s.style.left = 14 + Math.round(Math.random() * 16) + 'px';
    el.pops.appendChild(s);
    while (el.pops.children.length > 6) el.pops.removeChild(el.pops.firstChild);
    setTimeout(() => s.remove(), 720);
  },

  // Vòng cung đỏ chỉ hướng người bắn mình. rel: góc (radian) của kẻ bắn so với hướng nhìn, 0 = phía trước.
  damageIndicator(rel) {
    const i = el.dmgdir.firstElementChild;
    i.style.transform = `rotate(${(-rel).toFixed(3)}rad)`;
    el.dmgdir.classList.add('show');
    clearTimeout(dirTimer);
    dirTimer = setTimeout(() => el.dmgdir.classList.remove('show'), 150);
  },

  // gap: khoảng hở giữa các vạch tâm ngắm (px). Nở ra khi chạy, nhảy, xả đạn.
  setCrosshair(gap) {
    const g = Math.round(gap);
    if (el.crosshair._g !== g) {
      el.crosshair._g = g;
      el.crosshair.style.setProperty('--gap', g + 'px');
    }
  },

  setStats(text) {
    el.stats.textContent = text;
  },

  toggleStats() {
    el.stats.classList.toggle('hidden');
    return !el.stats.classList.contains('hidden');
  },

  statsVisible() {
    return !el.stats.classList.contains('hidden');
  },

  vignette() {
    el.vignette.classList.add('show');
    clearTimeout(vigTimer);
    vigTimer = setTimeout(() => el.vignette.classList.remove('show'), 120);
  },

  killfeed(killer, victim, weaponName, head, meId) {
    const row = document.createElement('div');
    const k = document.createElement('span');
    k.textContent = killer.name;
    k.className = killer.team === 'A' ? 'r' : 'b';
    const w = document.createElement('span');
    w.className = 'w';
    w.textContent = (head ? '★ ' : '') + weaponName;
    const v = document.createElement('span');
    v.textContent = victim.name;
    v.className = victim.team === 'A' ? 'r' : 'b';
    row.append(k, w, v);
    if (killer.id === meId || victim.id === meId) row.classList.add('me');
    el.killfeed.appendChild(row);
    while (el.killfeed.children.length > 5) el.killfeed.removeChild(el.killfeed.firstChild);
    setTimeout(() => row.remove(), 6000);
  },

  showClickPlay(on) {
    el.clickplay.classList.toggle('hidden', !on);
  },

  showScoreboard(on, room, meId) {
    if (on) this.renderScoreboard(room, meId);
    el.scoreboard.classList.toggle('hidden', !on);
  },

  renderScoreboard(room, meId) {
    if (!room) return;
    const sb = el.scoreboard;
    sb.textContent = '';
    const cols = document.createElement('div');
    cols.className = 'cols';
    for (const team of ['A', 'B']) {
      const col = document.createElement('div');
      col.className = team === 'A' ? 'red' : 'blue';
      const h = document.createElement('h3');
      const t = document.createElement('span');
      t.textContent = TEAM_NAMES[team];
      const sc = document.createElement('span');
      sc.textContent = team === 'A' ? room.scoreA : room.scoreB;
      h.append(t, sc);
      col.appendChild(h);

      const table = document.createElement('table');
      const head = document.createElement('tr');
      for (const label of ['Tên', 'Hạ', 'Chết']) {
        const th = document.createElement('th');
        th.textContent = label;
        head.appendChild(th);
      }
      table.appendChild(head);
      const players = room.players.filter((p) => p.team === team).sort((a, b) => b.k - a.k || a.d - b.d);
      for (const p of players) {
        const tr = document.createElement('tr');
        if (p.id === meId) tr.classList.add('me');
        if (!p.alive) tr.classList.add('dead');
        for (const val of [p.name + (p.on ? '' : ' (mất kết nối)'), p.k, p.d]) {
          const td = document.createElement('td');
          td.textContent = val;
          tr.appendChild(td);
        }
        table.appendChild(tr);
      }
      col.appendChild(table);
      cols.appendChild(col);
    }
    sb.appendChild(cols);
  },
};
