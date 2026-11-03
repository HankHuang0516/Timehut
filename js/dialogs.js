/* Form-based confirmations keep batch operations readable on small screens. */
window.TimehutDialogs = (() => {
    let current = null;
    function open({ title, message = '', kind = 'confirm', confirmText = '確認', allowOther = false, danger = false, initialValue = '', dialogId = null, okId = null, cancelId = null, excludedAlbumId = null }) {
        if (current) return Promise.resolve(null);
        return new Promise(resolve => {
            const previous = document.activeElement;
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay timehut-dialog';
            if(dialogId)overlay.id=dialogId;
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', 'batchDialogTitle');
            const form = document.createElement('form'); form.className = 'modal-card';
            const header = document.createElement('div'); header.className = 'dialog-header';
            const content = document.createElement('div'); content.className = 'dialog-body';
            const heading = document.createElement('h3'); heading.id = 'batchDialogTitle'; heading.textContent = title;
            const description = document.createElement('p'); description.textContent = message;
            header.append(heading); content.append(description); form.append(header, content);
            let input,afterOpen=()=>{},ownedRows=new Map(),ownedAuthority=null,ownedValid=()=>false;
            if (kind === 'text') {
                const label=document.createElement('label');label.textContent='相簿名稱';
                input=document.createElement('input');input.type='text';input.name='albumTitle';input.required=true;input.maxLength=80;input.value=initialValue;label.append(input);content.append(label);
            } else if (kind === 'tags') {
                const label = document.createElement('label'); label.textContent = '標籤（用空格分開）';
                input = document.createElement('input'); input.type = 'text'; input.required = true; input.name = 'tags';
                input.placeholder = '例如：公園 家人 開心'; label.append(input); content.append(label);
            } else if (kind === 'owned-album') {
                const state=window.TimehutAccounts?.status?.();const authority={owner:state?.user?.id,generation:state?.generation};ownedAuthority=authority;
                const valid=()=>overlay.isConnected&&!finished&&current===overlay&&TimehutAccounts.status().authenticated&&TimehutAccounts.status().user?.id===authority.owner&&TimehutAccounts.status().generation===authority.generation;
                ownedValid=valid;
                const label=document.createElement('label');label.textContent='搜尋已載入相簿';const search=document.createElement('input');search.type='search';search.placeholder='相簿名稱';label.append(search);content.append(label);
                input=document.createElement('select');input.name='album';input.hidden=true;input.add(new Option('請選擇相簿',''));content.append(input);
                const list=document.createElement('div');list.className='dialog-album-options';const status=document.createElement('p');status.setAttribute('role','status');const more=document.createElement('button');more.type='button';more.className='btn-secondary';more.textContent='載入更多相簿';content.append(list,status,more);let page=0,pages=1,reading=false;
                const render=()=>{list.replaceChildren();const query=search.value.trim().toLocaleLowerCase();for(const row of ownedRows.values()){if(query&&!row.title.toLocaleLowerCase().includes(query))continue;const item=document.createElement('label');item.className='dialog-album-option';const radio=document.createElement('input');radio.type='radio';radio.name='albumChoice';radio.value=row.id;radio.checked=input.value===row.id;radio.required=true;radio.onchange=()=>{input.value=row.id;for(const e of list.querySelectorAll('input'))e.checked=e.value===row.id;ok.disabled=false;};const name=document.createElement('span');name.textContent=row.title;item.append(radio,name);list.append(item);}if(!list.children.length){const empty=document.createElement('p');empty.textContent=page?'沒有符合的已載入相簿。':'正在讀取相簿…';list.append(empty);}};search.oninput=()=>{input.value='';ok.disabled=true;render();};
                const load=async()=>{if(reading||!valid())return;reading=true;more.disabled=true;status.textContent='正在讀取相簿…';try{const next=page+1,data=await TimehutAccounts.request('/api/accounts/albums?page='+next+'&per_page=30',{expectedAuthority:authority});if(!valid())return;if(!Array.isArray(data.albums)||data.page!==next||!Number.isSafeInteger(data.pages)||data.pages<next||data.pages>100||data.albums.some(a=>typeof a.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(a.id)||typeof a.title!=='string'||ownedRows.has(a.id)))throw Error();for(const row of data.albums){if(row.id===excludedAlbumId)continue;ownedRows.set(row.id,{id:row.id,title:row.title});input.add(new Option(row.title,row.id));}page=next;pages=data.pages;render();more.hidden=page>=pages;status.textContent='已載入 '+ownedRows.size+' 本；選擇一本作為目的地。';}catch(_){if(valid()){status.textContent='相簿清單尚未確認，請重試。';more.hidden=false;more.textContent='重新讀取相簿';}}finally{reading=false;if(valid())more.disabled=false;}};
                more.onclick=load;afterOpen=()=>{ok.disabled=true;void load();};
            } else if (kind === 'album') {
                const label = document.createElement('label'); label.textContent = '選擇目標相簿';
                input = document.createElement('select'); input.name = 'album'; input.required = true;
                const placeholder = new Option('請選擇相簿', ''); placeholder.disabled = true; placeholder.selected = true; input.add(placeholder);
                CONFIG.CHILDREN.forEach((child, index) => input.add(new Option(child.name, String(index + 1))));
                if (allowOther) input.add(new Option('其他相簿 ID', 'other'));
                label.append(input); content.append(label);
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
                    other.setAttribute('aria-label', '其他相簿 ID'); other.hidden = true; content.append(other);
                    input.addEventListener('change', () => { other.hidden = input.value !== 'other'; other.required = !other.hidden; });
                }
            }
            const actions = document.createElement('div'); actions.className = 'modal-actions';
            const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn btn-secondary'; cancel.textContent = '取消';if(cancelId)cancel.id=cancelId;
            const ok = document.createElement('button'); ok.type = 'submit'; ok.className = 'btn btn-primary'; ok.textContent = confirmText;if(okId)ok.id=okId;
            if (danger) { overlay.classList.add('danger-dialog');ok.classList.add('btn-danger'); }
            actions.append(cancel, ok); form.append(actions); overlay.append(form); document.body.append(overlay); current = overlay;
            const inactive=[...document.body.children].filter(e=>e!==overlay&&!['SCRIPT','STYLE','LINK'].includes(e.tagName)).map(e=>[e,e.inert]);for(const [e] of inactive)e.inert=true;
            const close = document.createElement('button'); close.type = 'button'; close.className = 'dialog-close'; close.textContent = '✕'; close.setAttribute('aria-label', '關閉視窗');
            close.addEventListener('click', () => finish(null)); header.append(close);
            const art = document.createElement('img'); art.className = 'dialog-art'; art.src = kind === 'tags' ? 'assets/storybook-upload-v1.png' : 'assets/storybook-family.png'; art.alt = ''; content.prepend(art);
            let resizeFrame = null,finished=false;
            const abort=()=>finish(null);
            window.addEventListener('timehut-account-changed',abort);window.addEventListener('pagehide',abort);
            function keepFocusedFieldVisible() {
                resizeFrame = null;
                const active = document.activeElement;
                if (!overlay.isConnected || !content.contains(active)) return;
                const area = content.getBoundingClientRect();
                let target = active.closest('label') || active;
                if (target.getBoundingClientRect().height > content.clientHeight - 16) target = active;
                const field = target.getBoundingClientRect();
                if (field.top < area.top + 8) content.scrollTop -= area.top + 8 - field.top;
                else if (field.bottom > area.bottom - 8) content.scrollTop += field.bottom - area.bottom + 8;
            }
            function scheduleFocusedField() {
                if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
                resizeFrame = requestAnimationFrame(keepFocusedFieldVisible);
            }
            window.addEventListener('resize', scheduleFocusedField);
            window.visualViewport?.addEventListener('resize', scheduleFocusedField);
            content.addEventListener('focusin', scheduleFocusedField);
            const contentSize = new ResizeObserver(scheduleFocusedField);
            contentSize.observe(content);
            function finish(value) {
                if(finished)return;finished=true;
                window.removeEventListener('timehut-account-changed',abort);window.removeEventListener('pagehide',abort);
                if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
                contentSize.disconnect();
                window.removeEventListener('resize', scheduleFocusedField);
                window.visualViewport?.removeEventListener('resize', scheduleFocusedField);
                document.removeEventListener('keydown', onKey, true); overlay.remove(); current = null;for(const [e,wasInert] of inactive)e.inert=wasInert;
                if (previous?.isConnected) previous.focus(); resolve(value);
            }
            function onKey(event) {
                if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish(null); }
                if (event.key !== 'Tab') return;
                const controls = [...form.querySelectorAll('input, select, button')].filter(el => !el.disabled && !el.hidden && el.getClientRects().length);
                if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
                else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
            }
            document.addEventListener('keydown', onKey, true);
            cancel.addEventListener('click', () => finish(null));
            overlay.addEventListener('click', event => { if (event.target === overlay) finish(null); });
            form.addEventListener('submit', event => {
                event.preventDefault();
                let value = kind === 'confirm' ? true : input.value.trim();
                if (kind === 'album' && value === 'other') value = form.elements.otherAlbum.value.trim();
                if (!value) return;
                if(kind==='owned-album'){const row=ownedRows.get(value);if(!row||!ownedValid())return;finish({...row,authority:{...ownedAuthority}});return;}
                finish(value);
            });
            (form.querySelector('input:not([hidden]),select:not([hidden])') || cancel).focus();
            afterOpen();
            scheduleFocusedField();
        });
    }
    return {
        chooseAlbum: ({title='選擇相簿',message='選擇這次操作的目標相簿。',confirmText='使用所選相簿',excludedAlbumId=null}={}) => open({title,message,confirmText,excludedAlbumId,kind:'owned-album'}),
        confirm: (message, options = {}) => open({ title: '確認操作', message, ...options }),
        tags: message => open({ title: '增加標籤', message, kind: 'tags', confirmText: '加入標籤' }),
        albumTitle: value => open({title:'重新命名相簿',message:'只修改名稱，照片、權限與相簿連結會保留。',kind:'text',initialValue:value,confirmText:'儲存名稱'}),
        album: (message, allowOther = true) => open({ title: '選擇相簿', message, kind: 'album', allowOther, confirmText: '繼續' })
    };
})();
