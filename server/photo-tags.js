const { flickrRequest } = require('./flickr-api');

// Album lists contain normalized tags. Preserve uploader metadata from signed raw tags.
async function setUserPhotoTags(photoId, tags, credentials, request = fetch) {
    if (typeof tags !== 'string' || tags.length > 20000 || (tags.match(/"/g) || []).length % 2) {
        throw new Error('標籤格式無效');
    }
    const info = await flickrRequest('flickr.photos.getInfo', { photo_id: photoId }, credentials, 'GET', request);
    if (!Array.isArray(info.photo?.tags?.tag)) throw new Error('無法確認原有標籤；未修改照片');
    const original = info.photo.tags.tag;
    if (original.some(tag => typeof tag.raw !== 'string')) throw new Error('無法確認原始標籤；未修改照片');
    const uploaders = original.filter(tag => typeof tag.raw === 'string' && tag.raw.startsWith('uploader:'));
    const protectedValues = new Set(uploaders.flatMap(tag => [tag.raw, tag._content]).filter(Boolean));
    const userTags = (tags.match(/"[^"]*"|\S+/g) || []).filter(token => {
        const value = token.replace(/^"|"$/g, '');
        return !value.startsWith('uploader:') && !protectedValues.has(value);
    });
    const preserved = uploaders.map(tag => /\s/.test(tag.raw) ? JSON.stringify(tag.raw) : tag.raw);
    const finalTags = [...preserved, ...userTags].join(' ');
    await flickrRequest('flickr.photos.setTags', { photo_id: photoId, tags: finalTags }, credentials, 'POST', request);
    return finalTags;
}

module.exports = { setUserPhotoTags };
