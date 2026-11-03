'use strict';
const crypto = require('node:crypto');
const {derive, replacePassword} = require('./account-passwords');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const tokenValid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const mailbox = value => typeof value === 'string' && value.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(value) ? value.toLowerCase() : null;
class EmailRejected extends Error {}

function validate(state) {
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const time = value => Number.isSafeInteger(value) && value >= 0;
    for (const user of Object.values(state.users)) {
        if (user.recoveryEmail !== undefined && (user.disabled || mailbox(user.recoveryEmail) !== user.recoveryEmail || !time(user.recoveryEmailVerifiedAt))) return false;
        if (user.recoveryEmailVerifiedAt !== undefined && user.recoveryEmail === undefined) return false;
    }
    if (state.emailActions !== undefined) {
        if (!object(state.emailActions)) return false;
        for (const [key, row] of Object.entries(state.emailActions)) {
            if (!/^[a-f0-9]{64}$/.test(key) || !object(row) || !Object.hasOwn(state.users, row.userId) || state.users[row.userId].disabled || !['verify', 'reset'].includes(row.kind) || mailbox(row.email) !== row.email || !/^[a-f0-9]{64}$/.test(row.passwordHash) || !/^[a-f0-9]{32}$/.test(row.salt) || !time(row.createdAt) || !time(row.expiresAt) || row.expiresAt <= row.createdAt) return false;
        }
    }
    if (state.emailRates !== undefined) {
        if (!object(state.emailRates)) return false;
        for (const [id, types] of Object.entries(state.emailRates)) {
            if (!Object.hasOwn(state.users, id) || state.users[id].disabled || !object(types)) return false;
            for (const [kind, row] of Object.entries(types)) if (!['verify', 'reset'].includes(kind) || !object(row) || !time(row.start) || !time(row.last) || !Number.isSafeInteger(row.count) || row.count < 1 || row.count > 5) return false;
        }
    }
    return true;
}
function revoke(state, userId, {removeEmail = false, removeRates = false} = {}) {
    for (const [key, row] of Object.entries(state.emailActions || {})) if (row.userId === userId) delete state.emailActions[key];
    if (removeRates && state.emailRates) delete state.emailRates[userId];
    if (removeEmail && state.users[userId]) {
        delete state.users[userId].recoveryEmail;
        delete state.users[userId].recoveryEmailVerifiedAt;
    }
}
function currentAction(store, key, kind) {
    const row = store.state.emailActions?.[key], user = row && store.state.users[row.userId];
    if (!row || row.kind !== kind || row.expiresAt <= store.now() || !user || user.disabled || user.passwordHash !== row.passwordHash || user.salt !== row.salt || (kind === 'reset' && user.recoveryEmail !== row.email)) throw new EmailRejected('Link unavailable');
    return structuredClone(row);
}
function issue(store, userId, kind, email, expected) {
    const token = crypto.randomBytes(32).toString('base64url'), key = digest(token), now = store.now();
    const accepted = store.commit(state => {
        const user = state.users[userId];
        if (!user || user.disabled || user.passwordHash !== expected.passwordHash || user.salt !== expected.salt || (kind === 'reset' && user.recoveryEmail !== email)) throw new EmailRejected('Account changed');
        if (expected.sessionHash) {
            const session = state.sessions[expected.sessionHash];
            if (!session || session.userId !== userId || session.expiresAt <= now) throw new EmailRejected('Session changed');
        }
        const prior = state.emailRates?.[userId]?.[kind];
        if (prior && (now - prior.last < 60000 || now - prior.start < 3600000 && prior.count >= 5)) return false;
        state.emailRates ??= {}; state.emailRates[userId] ??= {};
        state.emailRates[userId][kind] = {start: prior && now - prior.start < 3600000 ? prior.start : now, count: prior && now - prior.start < 3600000 ? prior.count + 1 : 1, last: now};
        state.emailActions ??= {};
        for (const [id, row] of Object.entries(state.emailActions)) if (row.expiresAt <= now || row.userId === userId && row.kind === kind) delete state.emailActions[id];
        state.emailActions[key] = {userId, kind, email, passwordHash:user.passwordHash, salt:user.salt, createdAt:now, expiresAt:now + 30 * 60000};
        return true;
    });
    return accepted ? {token, key, kind, email} : null;
}

// No recipient, credential, password or action link is written to application logs.
function resendMail(env = process.env, request = fetch) {
    const key = env.RESEND_API_KEY, from = env.TIMEHUT_EMAIL_FROM || env.EMAIL_FROM;
    const configured = typeof key === 'string' && /^re_[A-Za-z0-9_]+$/.test(key) && !!mailbox(from);
    const base = 'https://just-healing-production.up.railway.app/app/account.html';
    return {
        configured,
        async send(job) {
            if (!configured) throw new Error('Recovery mail unavailable');
            const link = base + '#' + new URLSearchParams({action:job.kind, token:job.token});
            const purpose = job.kind === 'verify' ? '驗證復原信箱' : '重設密碼';
            const response = await request('https://api.resend.com/emails', {
                method:'POST', redirect:'error', signal:AbortSignal.timeout(10000),
                headers:{Authorization:'Bearer ' + key, 'Content-Type':'application/json', 'Idempotency-Key':'timehut-' + job.kind + '-' + job.key},
                body:JSON.stringify({from:'時光相簿 <' + from + '>', to:[job.email], reply_to:'hankhuang0516@gmail.com', subject:'時光相簿：' + purpose,
                    text:'請開啟下列連結' + purpose + '（30 分鐘內有效，僅能使用一次）：\n' + link + '\n\n若非你本人提出，請忽略本郵件。請勿將連結轉交他人。',
                    html:'<p>請開啟下列連結' + purpose + '：</p><p><a href="' + link.replaceAll('&', '&amp;') + '">' + purpose + '</a></p><p>30 分鐘內有效，僅能使用一次。若非你本人提出，請忽略本郵件。請勿將連結轉交他人。</p>',
                    // Reset links must not be rewritten for click tracking.
                    tags:[{name:'app',value:'timehut'}]})
            });
            if (!response.ok) throw new Error('Recovery mail unconfirmed');
            const result = await response.json();
            if (typeof result.id !== 'string') throw new Error('Recovery mail unconfirmed');
            return {accepted:true};
        }
    };
}
class AccountEmail {
    constructor(store, mail = resendMail()) { this.store = store; this.mail = mail; }
    status(userId) {
        this.store.assertAvailable();
        const user = this.store.state.users[userId];
        if (!user || user.disabled) throw new EmailRejected('Account unavailable');
        return {configured:this.mail.configured === true, email:user.recoveryEmail || null, verified:!!user.recoveryEmail};
    }
    async bind(userId, session, email, password) {
        if (!this.mail.configured) throw new Error('Recovery mail unavailable');
        const normalized = mailbox(email);
        if (!normalized || typeof password !== 'string' || password.length > 128) throw new EmailRejected('Invalid recovery email');
        this.store.assertAvailable();
        const user = this.store.state.users[userId];
        if (!user || user.disabled) throw new EmailRejected('Account unavailable');
        const expected = {salt:user.salt, passwordHash:user.passwordHash, sessionHash:digest(session)};
        if (!crypto.timingSafeEqual(await derive(password, expected.salt), Buffer.from(expected.passwordHash, 'hex'))) throw new EmailRejected('Password rejected');
        const job = issue(this.store, userId, 'verify', normalized, expected);
        if (!job) throw new EmailRejected('Please wait before sending again');
        await this.mail.send(job);
        return {verificationRequested:true};
    }
    requestReset(name) {
        this.store.assertAvailable();
        if (!this.mail.configured) throw new Error('Recovery mail unavailable');
        const normalized = typeof name === 'string' && name.length <= 32 ? name.trim().toLowerCase() : '';
        const user = Object.values(this.store.state.users).find(row => !row.disabled && row.username === normalized && row.recoveryEmail);
        if (!user) return null;
        const job = issue(this.store, user.id, 'reset', user.recoveryEmail, {salt:user.salt, passwordHash:user.passwordHash});
        return job ? () => this.mail.send(job) : null;
    }
    verify(token) {
        this.store.assertAvailable();
        if (!tokenValid(token)) throw new EmailRejected('Link unavailable');
        const key = digest(token), original = currentAction(this.store, key, 'verify');
        return this.store.commit(state => {
            const row = state.emailActions?.[key], user = state.users[original.userId];
            if (!row || JSON.stringify(row) !== JSON.stringify(original) || row.expiresAt <= this.store.now() || !user || user.disabled || user.salt !== row.salt || user.passwordHash !== row.passwordHash) throw new EmailRejected('Link unavailable');
            user.recoveryEmail = row.email; user.recoveryEmailVerifiedAt = this.store.now();
            revoke(state, user.id);
            return {emailVerified:true};
        });
    }
    async reset(token, password) {
        this.store.assertAvailable();
        if (!tokenValid(token) || typeof password !== 'string' || password.length < 12 || password.length > 128) throw new EmailRejected('Link or password unavailable');
        const key = digest(token), original = currentAction(this.store, key, 'reset');
        const salt = crypto.randomBytes(16).toString('hex'), hash = (await derive(password, salt)).toString('hex');
        return this.store.commit(state => {
            const row = state.emailActions?.[key], user = state.users[original.userId];
            if (!row || JSON.stringify(row) !== JSON.stringify(original) || row.expiresAt <= this.store.now() || !user || user.disabled || user.salt !== row.salt || user.passwordHash !== row.passwordHash || user.recoveryEmail !== row.email) throw new EmailRejected('Link unavailable');
            replacePassword(state, user.id, salt, hash, this.store.now());
            return {passwordReset:true, signInRequired:true};
        });
    }
}
module.exports = {AccountEmail, EmailRejected, mailbox, validate, revoke, resendMail};
