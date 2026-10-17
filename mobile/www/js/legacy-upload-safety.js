/* Safety adapter for the published legacy gallery. No backend or Flickr writes beyond user-selected uploads. */
(() => {
    'use strict';
    const key = 'timehut_legacy_upload_receipts_v1';
    const labels = {not_sent: '尚未送出', sending: '傳送中', accepted: '伺服器已收件，待確認', completed: '伺服器確認已存入 Flickr', unknown: '結果未知，請勿重傳', rejected: '伺服器回報失敗，請先核對', server_error: '伺服器處理異常，請勿重傳'};
    const fingerprint = file => JSON.stringify([file.name, file.size, file.lastModified]);
    const uncertain = message => Object.assign(new Error(message), {uploadOutcomeUnknown: true});
    const state = {rows: [], checking: false, storageWarning: false};
    try {
        const stored = sessionStorage.getItem(key);
        const saved = stored === null ? [] : JSON.parse(stored);
        if (!Array.isArray(saved) || !saved.every(row => {
            if (!row || typeof row.name !== 'string' || typeof row.fingerprint !== 'string' || !Object.hasOwn(labels, row.status)) return false;
            const parts = JSON.parse(row.fingerprint);
            return Array.isArray(parts) && parts.length === 3 && parts[0] === row.name && Number.isFinite(parts[1]) && parts[1] >= 0 && parts[1] === row.size && Number.isFinite(parts[2]) &&
                (row.status !== 'accepted' || /^local_[A-Za-z0-9_-]+$/.test(row.localId || '')) &&
                (row.status !== 'completed' || /^\d+$/.test(row.photoId || ''));
        })) throw new Error('Invalid receipt history');
        state.rows = saved.map(row => ({...row, status: row.status === 'sending' ? 'unknown' : row.status}));
    } catch { state.storageWarning = true; }

    function save() {
        if (state.storageWarning) return false;
        try {
            sessionStorage.setItem(key, JSON.stringify(state.rows.map(({task, ...row}) => row)));
            return true;
        } catch { state.storageWarning = true; return false; }
    }
    function element(tag, text, className) {
        const node = document.createElement(tag);
        if (text) node.textContent = text;
        if (className) node.className = className;
        return node;
    }
    function render() {
        let panel = document.getElementById('uploadSafetyResults');
        if (!state.rows.length && !state.storageWarning) return;
        if (!panel) {
            panel = element('section', '', 'upload-safety-results');
            panel.id = 'uploadSafetyResults';
            panel.setAttribute('aria-label', '上傳結果');
            (document.querySelector('.timeline-section') || document.querySelector('main') || document.body).prepend(panel);
        }
        panel.replaceChildren();
        const count = status => state.rows.filter(row => row.status === status).length;
        const allDone = state.rows.length > 0 && state.rows.every(row => row.status === 'completed');
        panel.append(element('h2', BackgroundUploader.isUploading ? '上傳進度' : allDone ? '上傳已確認完成' : '上傳結果待確認'));
        const summary = element('p', `已完成 ${count('completed')} · 已收件 ${count('accepted')} · 結果未知 ${count('unknown')} · 尚未送出 ${count('not_sent')} · 異常 ${count('rejected') + count('server_error')}`);
        summary.setAttribute('role', 'status');
        panel.append(summary);
        panel.append(element('p', '「已收件」不代表已存入 Flickr。結果未知或處理異常的檔案可能已上傳，請先核對相簿，避免重複。'));
        const list = element('ul');
        for (const row of state.rows) {
            const item = element('li');
            item.append(element('strong', row.name), element('span', labels[row.status]));
            if (row.note) item.append(element('small', row.note));
            list.append(item);
        }
        panel.append(list);
        const actions = element('div', '', 'upload-safety-actions');
        const check = element('button', state.checking ? '確認中…' : '重新確認收件狀態');
        check.type = 'button';
        check.disabled = state.checking || BackgroundUploader.isUploading || !state.rows.some(row => row.status === 'accepted' && row.localId);
        check.addEventListener('click', checkReceipts);
        actions.append(check);
        const unsent = state.rows.filter(row => row.status === 'not_sent' && row.task);
        if (unsent.length) {
            const resume = element('button', `只傳送尚未送出的 ${unsent.length} 個`);
            resume.id = 'resumeUnsentUploads';
            resume.type = 'button';
            resume.disabled = BackgroundUploader.isUploading || state.checking;
            resume.addEventListener('click', () => runRows(unsent));
            actions.append(resume);
        }
        if (state.rows.some(row => row.status === 'not_sent' && !row.task)) {
            const reselect = element('button', '重新選取未送出檔案');
            reselect.type = 'button';
            reselect.disabled = BackgroundUploader.isUploading || state.checking || state.storageWarning;
            reselect.addEventListener('click', () => {
                state.rows = state.rows.filter(row => row.status !== 'not_sent' || row.task);
                save(); render();
                alert('原檔已不在此頁。請只選取尚未送出的檔案，並重新確認相簿與標籤。');
                document.getElementById('uploadBtn')?.click();
            });
            actions.append(reselect);
        }
        panel.append(actions);
        panel.append(element('p', '傳送時請保持 App 開啟；本頁不會自動重傳或重新整理。尚未送出的原檔只保留在本頁，關閉或重整後需重新選取。', 'upload-safety-note'));
        if (state.storageWarning) panel.append(element('p', '此瀏覽器無法安全保存收件紀錄，已暫停新傳送。請保留本頁並先記下結果。', 'upload-safety-note'));
    }

    // The old endpoint has no proven idempotent replay. Any lost reply must stop creation, not invite a retry.
    Uploader.uploadFiles = function (files, options = {}) {
        return new Promise((resolve, reject) => {
            if (files.length !== 1) return reject(new Error('請逐檔傳送'));
            const body = new FormData();
            body.append('files', files[0]);
            for (const field of ['albumId', 'title', 'description', 'tags']) if (options[field]) body.append(field, options[field]);
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${this.apiUrl}/api/upload`);
            xhr.timeout = 600000;
            xhr.upload.addEventListener('progress', event => {
                if (event.lengthComputable) options.onProgress?.(Math.min(99, event.loaded / event.total * 100));
            });
            xhr.onerror = () => reject(uncertain('連線中斷，未收到伺服器回覆；檔案可能已送達。'));
            xhr.ontimeout = () => reject(uncertain('等待回覆逾時；檔案可能已送達。'));
            xhr.onabort = () => reject(uncertain('傳送中斷；伺服器是否收到尚未確認。'));
            xhr.onload = () => {
                let data;
                try { data = JSON.parse(xhr.responseText); }
                catch { reject(uncertain(`回覆無法辨識（HTTP ${xhr.status}）；請勿重傳。`)); return; }
                if (xhr.status < 200 || xhr.status >= 300) {
                    // A server/proxy failure may occur after staging the file.
                    reject(uncertain(`伺服器回覆異常（HTTP ${xhr.status}）；請先核對相簿。`));
                    return;
                }
                const result = data && typeof data === 'object' && Array.isArray(data.results) ? data.results[0] : null;
                if (!result || typeof result !== 'object' || data.results.length !== 1 || result.filename !== files[0].name || typeof result.success !== 'boolean') {
                    reject(uncertain('未取得完整收件紀錄；請先核對相簿。'));
                } else if (!result.success) {
                    reject(Object.assign(new Error('伺服器回報失敗；是否已建立仍待核對，請勿直接重傳。'), {rejected: true}));
                } else if ((data._staged || result._staged) && typeof result.localId === 'string' && /^local_[A-Za-z0-9_-]+$/.test(result.localId)) {
                    resolve({status: 'accepted', localId: result.localId});
                } else if (!(data._staged || result._staged) && /^\d+$/.test(String(result.photoId || ''))) {
                    resolve({status: 'completed', photoId: String(result.photoId)});
                } else reject(uncertain('收件回覆缺少確認編號；請先核對相簿。'));
            };
            xhr.send(body);
        });
    };

    async function checkReceipts() {
        if (state.checking || BackgroundUploader.isUploading) return;
        state.checking = true;
        render();
        try {
            for (const row of state.rows.filter(item => item.status === 'accepted' && item.localId)) {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 8000);
                try {
                    const response = await fetch(`${Uploader.apiUrl}/api/uploads/status/${encodeURIComponent(row.localId)}`, {signal: controller.signal, cache: 'no-store'});
                    if (response.status === 404) {
                        // Legacy worker removes completed receipts. Absence is neither success nor failure.
                        row.note = '伺服器已不保留此收件紀錄，請到相簿核對；請勿直接重傳。';
                        continue;
                    }
                    if (!response.ok) throw new Error('status');
                    const data = await response.json();
                    if (data.localId !== row.localId) throw new Error('identity');
                    if (data.status === 'completed' && /^\d+$/.test(String(data.flickrPhotoId || ''))) {
                        row.status = 'completed'; row.photoId = String(data.flickrPhotoId); row.note = '';
                    } else if (data.status === 'error') {
                        row.status = 'server_error'; row.note = '原檔可能已存入 Flickr，請先核對相簿。';
                    } else row.note = '伺服器仍在處理，稍後可重新確認。';
                } catch { row.note = '暫時無法讀取狀態；已收件紀錄保留，請勿重傳。'; }
                finally { clearTimeout(timer); }
            }
        } finally { state.checking = false; save(); render(); }
    }

    async function runRows(rows) {
        if (BackgroundUploader.isUploading || state.checking || !rows.length) return;
        BackgroundUploader.isUploading = true;
        BackgroundUploader.showGlobalBar();
        let wakeLock;
        try {
            try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* Optional; never blocks upload. */ }
            render();
            for (const row of rows) {
                if (row.status !== 'not_sent' || !row.task) continue;
                if (navigator.onLine === false || document.visibilityState === 'hidden') {
                    row.note = '傳送已暫停。回到本頁並確認連線後，再傳送尚未送出的檔案。';
                    break;
                }
                row.status = 'sending';
                if (!save()) { row.status = 'not_sent'; row.note = '收件紀錄無法保存，尚未傳送。'; break; }
                render();
                BackgroundUploader.updateStatus(`傳送中：${row.name}`);
                BackgroundUploader.updateProgress(0);
                try {
                    Object.assign(row, await Uploader.uploadFiles([row.task.file], {...row.task, onProgress: percent => BackgroundUploader.updateProgress(percent)}));
                    row.note = '';
                } catch (error) {
                    row.status = error.rejected ? 'rejected' : 'unknown';
                    row.note = error.message;
                    break;
                } finally { save(); render(); }
            }
        } finally {
            try { await wakeLock?.release(); } catch { /* Already released by browser. */ }
            BackgroundUploader.isUploading = false;
            const allDone = rows.every(row => row.status === 'completed');
            BackgroundUploader.updateStatus(allDone ? '上傳已確認完成' : '上傳尚未全部確認，請查看逐檔結果');
            if (BackgroundUploader.percentText) BackgroundUploader.percentText.textContent = '';
            if (BackgroundUploader.progressBar) BackgroundUploader.progressBar.style.width = '0%';
            BackgroundUploader.hideGlobalBar();
            save(); render();
            await checkReceipts();
            document.getElementById('uploadSafetyResults')?.scrollIntoView({block: 'start', behavior: 'smooth'});
        }
    }
    BackgroundUploader.startTasks = async function (tasks) {
        if (this.isUploading || state.checking) return;
        const rows = [];
        for (const task of tasks) {
            const id = fingerprint(task.file);
            // Filename alone is not a receipt. This only prevents accidental re-selection of the exact local file.
            const old = state.rows.find(row => row.fingerprint === id);
            if (old) continue;
            const row = {fingerprint: id, name: task.file.name, size: task.file.size, status: 'not_sent', task: {...task}};
            state.rows.push(row); rows.push(row);
        }
        save(); render();
        if (rows.length) await runRows(rows);
        else document.getElementById('uploadSafetyResults')?.scrollIntoView({block: 'start'});
    };
    const originalStart = UploadUI.startUpload.bind(UploadUI);
    UploadUI.startUpload = function () {
        if (state.storageWarning) {
            render();
            alert('收件紀錄無法安全讀取或保存，已暫停新傳送；選取的原檔與設定已保留。請先記下既有結果。');
            return;
        }
        if (BackgroundUploader.isUploading || state.checking) {
            alert('請等目前傳送或狀態確認結束；新選取的檔案已保留。');
            return;
        }
        if (this.fileList.some(file => state.rows.some(row => row.fingerprint === fingerprint(file)))) {
            alert('選取內容包含已有收件或未送出紀錄的檔案。請先查看逐檔結果；原本未送出的檔案請用「只傳送尚未送出」按鈕，避免更改原設定或重複上傳。');
            return;
        }
        return originalStart();
    };
    window.addEventListener('beforeunload', event => {
        if (state.rows.some(row => row.task && ['not_sent', 'sending', 'unknown', 'rejected'].includes(row.status))) {
            event.preventDefault(); event.returnValue = '';
        }
    });
    document.addEventListener('DOMContentLoaded', render);
})();
