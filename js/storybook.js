/* Shared progressive enhancement; original page handlers remain authoritative. */
(() => {
    'use strict';
    const portraits = ['assets/storybook-boy.png', 'assets/storybook-girl.png'];
    function decorateProfiles() {
        document.querySelectorAll('.profile-btn').forEach((button, index) => {
            const emoji = button.querySelector('.profile-emoji');
            if (emoji && !emoji.querySelector('img')) {
                const image = document.createElement('img');
                image.src = portraits[index % portraits.length]; image.alt = ''; emoji.replaceChildren(image);
                const label = document.createElement('span'); label.className = 'profile-label';
                label.textContent = CONFIG.CHILDREN[index]?.name || ''; button.append(label);
                const age = document.createElement('small'); age.className = 'profile-age';
                const child = CONFIG.CHILDREN[index];
                if (child && typeof calculateAge === 'function' && typeof formatAgeString === 'function') {
                    const value = calculateAge(child.birthDate, new Date().toLocaleDateString('en-CA'));
                    age.textContent = formatAgeString(value.years, value.months, value.days);
                    label.append(age);
                }
            }
        });
        document.querySelectorAll('.child-card .child-emoji').forEach((emoji, index) => {
            if (emoji.querySelector('img')) return;
            const image = document.createElement('img'); image.src = portraits[index % portraits.length]; image.alt = ''; emoji.replaceChildren(image);
        });
    }
    function init() {
        const header=document.querySelector('.header');
        if(header) new ResizeObserver(()=>document.documentElement.style.setProperty('--storybook-header-height',`${header.getBoundingClientRect().height}px`)).observe(header);
        const bars=[...document.querySelectorAll('.selection-bar,.moment-selection-bar')];
        if(bars.length){const observer=new ResizeObserver(()=>document.documentElement.style.setProperty('--storybook-selection-height',`${Math.max(...bars.map(bar=>bar.getBoundingClientRect().height))}px`));bars.forEach(bar=>observer.observe(bar));}
        decorateProfiles();
        const profileList = document.querySelector('.child-profiles');
        if (profileList) new MutationObserver(decorateProfiles).observe(profileList, {childList:true});
        const picker = document.getElementById('uploadDropzone');
        picker?.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); document.getElementById('fileInput').click(); } });
        const image=document.getElementById('modalImage'),modal=document.getElementById('photoModal');
        if(image&&modal) {
            let token=0;
            let video=document.getElementById('modalVideo');
            if(!video){video=document.createElement('video');video.id='modalVideo';video.className='modal-video';image.after(video);}
            video.controls=true;video.playsInline=true;video.preload='metadata';video.hidden=true;
            const mediaStatus=document.createElement('p');mediaStatus.id='modalMediaStatus';mediaStatus.className='viewer-media-status';mediaStatus.setAttribute('role','status');mediaStatus.hidden=true;
            const mediaRetry=document.createElement('button');mediaRetry.id='modalMediaRetry';mediaRetry.type='button';mediaRetry.className='btn-secondary viewer-media-status';mediaRetry.textContent='重試播放';mediaRetry.hidden=true;
            const info=modal.querySelector('.modal-info');info.prepend(mediaStatus);mediaStatus.after(mediaRetry);
            let activeVideo=false,activePhoto=null;
            const stop=()=>{token++;activeVideo=false;activePhoto=null;mediaStatus.hidden=true;mediaRetry.hidden=true;video.pause();video.removeAttribute('src');video.load();video.hidden=true;};
            const playbackFailed=()=>{if(!activeVideo||!modal.classList.contains('active'))return;video.hidden=true;video.style.display='none';image.hidden=false;image.style.display='block';mediaStatus.textContent=CONFIG.ACCOUNT_MODE?'影片暫時無法播放，請重試或下載原檔':'影片暫時無法播放，請重試或在 Flickr 開啟';mediaStatus.hidden=false;mediaRetry.hidden=false;};
            const loadVideo=async(current)=>{
                try {
                    const url=await FlickrAPI.getVideoUrl(activePhoto);
                    if(current!==token||!activeVideo||!modal.classList.contains('active'))return;
                    video.src=url;video.hidden=false;video.style.display='block';image.hidden=true;image.style.display='none';video.load();
                } catch(error) { if(current===token)playbackFailed(); }
            };
            mediaRetry.addEventListener('click',()=>{
                if(!activeVideo||!activePhoto)return;
                mediaStatus.textContent='正在重新載入影片…';mediaStatus.hidden=false;mediaRetry.hidden=true;
                loadVideo(++token);
            });
            window.TimehutViewerMedia={stop,async show(photo){
                stop();const current=token;image.hidden=false;image.style.display='block';
                let link=document.getElementById('modalVideoLink');
                if(!link){link=document.createElement('a');link.id='modalVideoLink';link.className='modal-download-btn';link.target='_blank';link.rel='noopener';link.textContent='▶ 在 Flickr 開啟影片';modal.querySelector('.modal-info').append(link);}
                link.hidden=CONFIG.ACCOUNT_MODE||photo.media!=='video';link.href=`https://www.flickr.com/photos/${encodeURIComponent(CONFIG.FLICKR_USER_ID)}/${encodeURIComponent(photo.id)}`;
                const download=document.getElementById('modalDownloadBtn');if(download)download.textContent=photo.media==='video'?'📥 下載影片':'📥 下載原圖';
                if(photo.media!=='video')return;
                activeVideo=true;activePhoto=photo;
                await loadVideo(current);
            }};
            video.addEventListener('error',()=>{if(video.error)playbackFailed();});
            video.addEventListener('loadedmetadata',()=>{if(activeVideo){mediaStatus.hidden=true;mediaRetry.hidden=true;}});
        }
        const profiles = document.querySelector('.sidebar-left');
        if (profiles) {
            const image = document.createElement('img'); image.className = 'sidebar-decoration';
            image.src = 'assets/storybook-garden-v1.png'; image.alt = ''; profiles.append(image);
        }
        const children = document.getElementById('childrenList');
        if (children) new MutationObserver(decorateProfiles).observe(children, { childList: true });
        document.querySelectorAll('.modal-close').forEach(button => button.setAttribute('aria-label', '關閉視窗'));
        document.querySelectorAll('.modal-prev').forEach(button => button.setAttribute('aria-label', '上一張照片'));
        document.querySelectorAll('.modal-next').forEach(button => button.setAttribute('aria-label', '下一張照片'));
        const selectButton = document.getElementById('headerSelectBtn');
        if (selectButton && !selectButton.querySelector('.btn-label')) {
            const label = document.createElement('span'); label.className = 'btn-label'; label.textContent = '多選'; selectButton.append(label);
            selectButton.setAttribute('aria-label', '照片多選');
        }
        document.querySelectorAll('a.header-btn[title="返回時間軸"]').forEach(link => {
            if (link.querySelector('.btn-label')) return;
            const label = document.createElement('span'); label.className = 'btn-label'; label.textContent = '返回時間軸'; link.append(label);
        });
        let activeDialog = null, previousFocus = null;
        const dialogIds = ['uploadModal', 'photoModal', 'confirmModal', 'moveCollectionModal', 'tagModal'];
        const dialogs = dialogIds.map(id => document.getElementById(id)).filter(Boolean);
        const observer = new MutationObserver(() => {
            const open = dialogs.find(dialog => dialog.classList.contains('active') || (dialog.classList.contains('modal-overlay') && !dialog.classList.contains('hidden')));
            if (open === activeDialog) return;
            if (open) {
                previousFocus = document.activeElement; activeDialog = open;
                open.setAttribute('role', 'dialog'); open.setAttribute('aria-modal', 'true');
                open.setAttribute('aria-label', open.querySelector('h2, h3')?.textContent || '照片檢視');
                const target = open.querySelector('button, input, select, a[href]'); if (target) target.focus();
            } else if (activeDialog) {
                activeDialog = null;
                if (previousFocus?.isConnected) previousFocus.focus();
                previousFocus = null;
            }
        });
        dialogs.forEach(dialog => observer.observe(dialog, { attributes: true, attributeFilter: ['class'] }));
        const viewer = document.querySelector('#photoModal .modal-info');
        if (viewer) {
            const chips = document.createElement('div'); chips.className = 'viewer-tags'; chips.setAttribute('aria-label', '照片標籤');
            chips.tabIndex = 0; chips.setAttribute('role', 'region');
            viewer.querySelector('.modal-tags-edit')?.before(chips);
            const decoration = document.createElement('img'); decoration.src = 'assets/storybook-family.png'; decoration.className = 'viewer-decoration'; decoration.alt = ''; viewer.append(decoration);
            const details = document.createElement('div'); details.className = 'viewer-details';
            details.tabIndex = 0; details.setAttribute('role', 'region'); details.setAttribute('aria-label', '照片資訊');
            for (const child of [...viewer.children]) {
                if (!child.matches('.modal-tags-edit,.modal-actions,.modal-download-btn,.viewer-decoration,.toast-container')) details.append(child);
            }
            viewer.prepend(details);
            const renderTags = () => {
                chips.replaceChildren(); (document.getElementById('editTagsInput')?.value || '').split(/\s+/).filter(Boolean).forEach(tag => {
                    const chip = document.createElement('span'); chip.className = 'viewer-tag'; chip.textContent = tag; chips.append(chip);
                });
            };
            const title = document.getElementById('modalTitle'); if (title) new MutationObserver(()=>{renderTags();details.scrollTop=0;chips.scrollTop=0;modal?.setAttribute('aria-label',title.textContent || '照片檢視');}).observe(title, {childList:true});
            document.getElementById('editTagsInput')?.addEventListener('input', renderTags);
        }
        document.addEventListener('keydown', event => {
            if (activeDialog?.id === 'moveCollectionModal' && event.key === 'Escape' && !document.querySelector('.timehut-dialog')) {
                event.preventDefault(); window.closeMoveCollectionModal?.(); return;
            }
            if (!activeDialog || event.key !== 'Tab' || document.querySelector('.timehut-dialog')) return;
            const buttons = [...activeDialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]')].filter(el => el.getClientRects().length > 0);
            const first = buttons[0], last = buttons.at(-1);
            if (!first) return;
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        });
    }
    (window.TimehutPage?.onReady || (fn => document.addEventListener('DOMContentLoaded',fn)))( init);
})();
