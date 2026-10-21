/* Subtitle analysis runs independently of the selected on-screen subtitle track. */
(function (root) {
  function seconds(value) {
    return value.replace(',', '.').split(':').reduce((total, part) => total * 60 + Number(part), 0);
  }
  function parse(text, offset = 0) {
    const map = text.match(/X-TIMESTAMP-MAP=.*LOCAL:([\d:.]+).*MPEGTS:(\d+)/);
    if (map) offset = Number(map[2]) / 90000 - seconds(map[1]);
    return Array.from(text.matchAll(/((?:\d+:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d+:)?\d{2}:\d{2}[.,]\d{3})/g), m => ({start: seconds(m[1]) + offset, end: seconds(m[2]) + offset}));
  }
  function detect(cues, duration) {
    const sorted = cues.filter(c => c.start >= 0 && c.end > c.start && c.end <= duration + 1).sort((a,b) => a.start-b.start);
    if (sorted.length < 20 || !Number.isFinite(duration)) return {intro: null, outro: null};
    let end = 0, intro = null;
    for (const cue of sorted) {
      const gap = cue.start - end;
      if (!intro && end < Math.min(600, duration * .3) && gap >= 25 && gap <= 180) intro = {start: end, end: cue.start};
      end = Math.max(end, cue.end);
    }
    const outro = end >= duration * .75 && duration - end >= 15 && duration - end <= 300 ? end : null;
    return {intro, outro};
  }
  async function load(tracks, master, signal) {
    // Some manifests label forced tracks with FORCED=NO: inspect the name/language too.
    const candidates = (tracks || []).filter(t => t.forced !== true && t.forced !== 'YES' &&
      !/forced|forzati|forzato/i.test([t.name, t.lang, t.language].join(' ')) && (t.uri || t.url));
    candidates.sort((a,b) => Number(/^(it|ita|italian|italiano)(|[-_])/i.test(b.lang || b.name || '')) - Number(/^(it|ita|italian|italiano)(|[-_])/i.test(a.lang || a.name || '')));
    async function read(url, referrer) {
      const base = String(url).startsWith('/api/') ? location.href : new URL(master || location.href, location.href).href;
      const absolute = new URL(url, base).href;
      let proxy;
      if (['/api/stream/segment', '/api/vixcloud/media'].includes(new URL(absolute).pathname)) {
        proxy = absolute;
      } else {
        const ref = referrer || '';
        proxy = '/api/stream/segment?url=' + encodeURIComponent(absolute) + (ref ? '&ref=' + encodeURIComponent(ref) : '');
      }
      const response = await fetch(proxy, {signal});
      if (!response.ok) throw new Error('Subtitle request failed');
      return {text: await response.text(), url: absolute};
    }
    for (const track of candidates) {
      try {
        const trackRef = track.referrer || track.ref;
        const source = await read(track.uri || track.url, trackRef);
        if (!source.text.trimStart().startsWith('#EXTM3U')) {
          const cues = parse(source.text);
          if (cues.length >= 20) return cues;
          continue;
        }
        // Only a complete VOD timeline can establish where dialogue ends.
        if (!source.text.includes('#EXT-X-ENDLIST')) continue;
        const segments = source.text.split(/\r\n|\r|\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
        const cues = [];
        for (const segment of segments) {
          const part = await read(new URL(segment, segment.startsWith('/api/stream/segment?') ? location.href : source.url).href, trackRef);
          cues.push(...parse(part.text));
        }
        if (cues.length >= 20) return cues;
      } catch (error) {
        if (signal.aborted) return [];
        console.warn('[Subtitle chapters]', error);
      }
    }
    return [];
  }
  root.SubtitleChapters = {parse, detect, load};
})(typeof window === 'undefined' ? module.exports : window);
