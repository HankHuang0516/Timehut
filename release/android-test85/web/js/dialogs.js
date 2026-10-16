/* Form-based confirmations keep batch operations readable on small screens. */
window.TimehutDialogs = (() => {
    let current = null;
    function open({ title, message = '', kind = 'confirm', confirmText = '確認', allowOther = false, danger = false, initialValue = '' }) {
        if (current) return Promise.resolve(null);
        return new Promise(resolve => {
            const previous = document.activeElement;
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay timehut-dialog';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', 'batchDialogTitle');
            const form = document.createElement('form'); form.className = 'modal-card';
            const heading = document.createElement('h3'); heading.id = 'batchDialogTitle'; heading.textContent = title;
            const description = document.createElement('p'); description.textContent = message;
            form.append(heading, description);
            let input;
            if (kind === 'text') {
                const label=document.createElement('label');label.textContent='相簿名稱';
                input=document.createElement('input');input.type='text';input.name='albumTitle';input.required=true;input.maxLength=80;input.value=initialValue;label.append(input);form.append(label);
            } else if (kind === 'tags') {
                const label = document.createElement('label'); label.textContent = '標籤（用空格分開）';
                input = document.createElement('input'); input.type = 'text'; input.required = true; input.name = 'tags';
                input.placeholder = '例如：公園 家人 開心'; label.append(input); form.append(label);
            } else if (kind === 'album') {
                const label = document.createElement('label'); label.textContent = '選擇目標相簿';
                input = document.createElement('select'); input.name = 'album'; input.required = true;
                const placeholder = new Option('請選擇相簿', ''); placeholder.disabled = true; placeholder.selected = true; input.add(placeholder);
                CONFIG.CHILDREN.forEach((child, index) => input.add(new Option(child.name, String(index + 1))));
                if (allowOther) input.add(new Option('其他相簿 ID', 'other'));
                label.append(input); form.append(label);
                const options = document.createElement('div'); options.className = 'dialog-album-options';
                input.hidden = true; input.required = false;
                [...input.options].filter(option => option.value).forEach(option => {
                    const row = document.createElement('label'); row.className = 'dialog-album-option';
                    const choice = document.createElement('input'); choice.type = 'radio'; choice.name = 'albumChoice'; choice.value = option.value; choice.required = true;
                    const portrait = document.createElement('img'); portrait.alt = ''; portrait.src = option.value === 'other' ? 'assets/storybook-garden-v1.png' : Number(option.value) % 2 ? 'assets/storybook-boy.png' : 'assets/storybook-girl.png';
                    const name = document.createElement('span'); name.textContent = option.textContent;
                    choice.addEventListener('change', () => { if (choice.checked) { input.value = choice.value; input.dispatchEvent(new Event('change')); } });
                    row.append(choice, portrait, name); options.append(row);
                });
                input.addEventListener('change', () => options.querySelectorAll('input').forEach(choice => { choice.checked = choice.value === input.value; }));
                label.after(options);
                if (allowOther) {
                    const other = document.createElement('input'); other.name = 'otherAlbum'; other.placeholder = '輸入其他相簿 ID';
                    other.setAttribute('aria-label', '其他相簿 ID'); other.hidden = true; form.append(other);
                    input.addEventListener('change', () => { other.hidden = input.value !== 'other'; other.required = !other.hidden; });
                }
            }
            const actions = document.createElement('div'); actions.className = 'modal-actions';
            const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn btn-secondary'; cancel.textContent = '取消';
            const ok = document.createElement('button'); ok.type = 'submit'; ok.className = 'btn btn-primary'; ok.textContent = confirmText;
            if (danger) { overlay.classList.add('danger-dialog');ok.classList.add('btn-danger'); }
            actions.append(cancel, ok); form.append(actions); overlay.append(form); document.body.append(overlay); current = overlay;
            const close = document.createElement('button'); close.type = 'button'; close.className = 'dialog-close'; close.textContent = '✕'; close.setAttribute('aria-label', '關閉視窗');
            close.addEventListener('click', () => finish(null)); form.prepend(close);
            const art = document.createElement('img'); art.className = 'dialog-art'; art.src = kind === 'tags' ? 'assets/storybook-upload-v1.png' : 'assets/storybook-family.png'; art.alt = ''; heading.after(art);
            function finish(value) {
                document.removeEventListener('keydown', onKey); overlay.remove(); current = null;
                if (previous?.isConnected) previous.focus(); resolve(value);
            }
            function onKey(event) {
                if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish(null); }
                if (event.key !== 'Tab') return;
                const controls = [...form.querySelectorAll('input, select, button')].filter(el => !el.hidden && el.getClientRects().length);
                if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
                else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
            }
            document.addEventListener('keydown', onKey);
            cancel.addEventListener('click', () => finish(null));
            overlay.addEventListener('click', event => { if (event.target === overlay) finish(null); });
            form.addEventListener('submit', event => {
                event.preventDefault();
                let value = kind === 'confirm' ? true : input.value.trim();
                if (kind === 'album' && value === 'other') value = form.elements.otherAlbum.value.trim();
                if (!value) return;
                finish(value);
            });
            (form.querySelector('input[type="radio"]') || input || cancel).focus();
        });
    }
    return {
        confirm: (message, options = {}) => open({ title: '確認操作', message, ...options }),
        tags: message => open({ title: '增加標籤', message, kind: 'tags', confirmText: '加入標籤' }),
        albumTitle: value => open({title:'重新命名相簿',message:'只修改名稱，照片、權限與相簿連結會保留。',kind:'text',initialValue:value,confirmText:'儲存名稱'}),
        album: (message, allowOther = true) => open({ title: '選擇相簿', message, kind: 'album', allowOther, confirmText: '繼續' })
    };
})();
