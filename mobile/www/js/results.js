/* A 2xx batch response is a receipt, not proof that each requested item succeeded. */
window.TimehutResults = {
    confirmed(data, ids) {
        if (!Array.isArray(data?.results)) throw new Error('缺少逐張操作結果，請重新確認相簿');
        const rows = new Map(data.results.map(row => [String(row.photoId), row]));
        const succeeded = ids.map(String).filter(id => rows.get(id)?.success === true);
        const failed = ids.map(String).filter(id => !succeeded.includes(id));
        return { succeeded, failed };
    },
    complete(data, ids) {
        const result = this.confirmed(data, ids);
        if (result.failed.length) throw new Error(`完成 ${result.succeeded.length}/${ids.length} 張；${result.failed.length} 張尚未完成，請保留選取並重試`);
        return result;
    },
    invalidateAlbumCache() {
        for (const key of ['albumPhotos', 'albumDate', 'albumMomentId', 'allPhotos', 'allPhotosChild']) sessionStorage.removeItem(key);
    }
};
