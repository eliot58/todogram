export function isImage(mime: string) {
    return /^image\/(jpe?g|png)$/.test(mime);
}

export function isVideo(mime: string) {
    return /^video\/(mp4)$/.test(mime);
}