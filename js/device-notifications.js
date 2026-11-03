/* Device permission does not change the completion-notification preference. */
(() => {
    'use strict';
    async function init() {
        const status=document.getElementById('deviceProgressNotificationStatus');if(!status)return;
        const enable=document.getElementById('enableDeviceNotifications'),settings=document.getElementById('openDeviceNotificationSettings');
        let plugin=null,busy=false,revision=0,disposed=false;
        async function refresh(){
            const current=++revision;
            try{
                if(!window.Capacitor?.isNativePlatform?.()){status.textContent='請在手機 App 中管理裝置通知。';return;}
                plugin=window.Capacitor.registerPlugin('TimehutTransfer');
                const capabilities=await plugin.capabilities();if(disposed||current!==revision)return;
                if(!capabilities.deviceNotificationControls){status.textContent='此版本請從手機設定開啟 App 通知。';return;}
                const value=await plugin.deviceNotificationSettings();if(disposed||current!==revision)return;
                if(!['prompt','denied','granted','provisional'].includes(value.permission)||typeof value.systemEnabled!=='boolean')throw new Error();
                enable.hidden=value.permission!=='prompt';settings.hidden=false;
                if(value.platform==='android'){
                    if(typeof value.transferChannelEnabled!=='boolean'||typeof value.canShowProgress!=='boolean')throw new Error();
                    status.textContent=value.canShowProgress?'裝置通知已開啟；上傳時可下拉通知欄查看總進度。':value.permission==='prompt'?'尚未允許裝置通知；啟用後可查看通知欄上傳總進度。':!value.systemEnabled||value.permission==='denied'?'裝置通知已關閉，通知欄不會顯示上傳進度。請開啟手機通知設定。':'裝置通知已開啟，但「照片與影片傳輸」通知類別已關閉，請至手機通知設定開啟。';
                }else status.textContent=value.systemEnabled?'裝置已允許通知；完成通知偏好請到傳輸中心設定。':value.permission==='prompt'?'尚未允許裝置通知，可按啟用裝置通知。':'裝置通知已關閉。請開啟手機通知設定；若只到設定首頁，請進入「App → 時光相簿 → 通知」允許通知。';
            }catch(_){if(!disposed&&current===revision)status.textContent='裝置通知狀態尚未確認，請更新手機狀態或從手機設定查看。';}
        }
        async function act(method){if(busy||!plugin)return;busy=true;enable.disabled=settings.disabled=true;try{await plugin[method]();}catch(_){status.textContent='未能開啟通知設定，請從手機設定進入本 App。';}finally{busy=false;enable.disabled=settings.disabled=false;await refresh();}}
        enable.onclick=()=>act('requestDeviceNotifications');settings.onclick=()=>act('openNotificationSettings');
        document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
        window.addEventListener('pagehide',()=>{disposed=true;revision++;});window.addEventListener('pageshow',()=>{disposed=false;refresh();});
        document.getElementById('refreshDeviceSettings')?.addEventListener('click',refresh);await refresh();
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
