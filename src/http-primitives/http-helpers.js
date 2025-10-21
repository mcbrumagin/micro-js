
function suggestTypeFromUrl(url) {
  if (!url || (url.search(/\.[A-Za-z0-9]+$/) === -1)) return
  else if (url.includes('.html')) return 'text/html'
  else if (url.includes('.xml')) return 'application/xml'
  else if (url.includes('.json')) return 'application/json'
  else if (url.includes('.js')) return 'text/javascript'
  else if (url.includes('.css')) return 'text/css'
  else if (url.includes('.svg')) return 'image/svg+xml'
  else if (url.includes('.png')) return 'image/png'
  else if (url.includes('.jpg')) return 'image/jpeg'
  else if (url.includes('.jpeg')) return 'image/jpeg'
  else if (url.includes('.gif')) return 'image/gif'
  else if (url.includes('.bmp')) return 'image/bmp'
  else if (url.includes('.tiff')) return 'image/tiff'
  else if (url.includes('.ico')) return 'image/x-icon'
  else if (url.includes('.webp')) return 'image/webp'
  else if (url.includes('.mp4')) return 'video/mp4'
  else if (url.includes('.webm')) return 'video/webm'
  else if (url.includes('.ogg')) return 'video/ogg'
  else if (url.includes('.mp3')) return 'audio/mpeg'
  else if (url.includes('.wav')) return 'audio/wav'
  else if (url.includes('.m4a')) return 'audio/mp4'
  else if (url.includes('.m4v')) return 'video/mp4'
  else if (url.includes('.mov')) return 'video/quicktime'
  else if (url.includes('.avi')) return 'video/x-msvideo'
  else if (url.includes('.wmv')) return 'video/x-ms-wmv'
  else if (url.includes('.flv')) return 'video/x-flv'
  else if (url.includes('.m3u8')) return 'application/vnd.apple.mpegurl'
  else if (url.includes('.m3u')) return 'application/vnd.apple.mpegurl'
  else if (url.includes('.pls')) return 'application/vnd.apple.mpegurl'
}

export { suggestTypeFromUrl }
