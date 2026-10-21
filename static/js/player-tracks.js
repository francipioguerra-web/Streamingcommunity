/* Provider WebVTT subtitles are separate from HLS subtitle renditions. */
(function (root) {
  class ExternalSubtitleTracks {
    constructor(video, create = () => document.createElement('track')) {
      this.video = video; this.create = create; this.tracks = []; this.signature = ''; this.selected = -1; this.onError = null;
    }
    setTracks(tracks) {
      const external = (tracks || []).filter(t => {
        try {
          const source = new URL(t.uri || t.url || '', 'http://localhost');
          const path = new URL(source.searchParams.get('url') || source.href).pathname;
          return t.format === 'vtt' || (source.pathname === '/api/vixcloud/media' && t.format === 'vtt') || /\.vtt$/i.test(path);
        } catch (_) { return false; }
      });
      const signature = JSON.stringify(external.map(t => [t.uri || t.url, t.name, t.lang]));
      if (signature === this.signature) return;
      const previous = this.tracks.find(track => track.id === this.selected);
      this.clear(); this.signature = signature;
      this.tracks = external.map((track, index) => {
        const element = this.create();
        element.kind = 'subtitles'; element.label = track.name || track.lang || `Sottotitolo ${index + 1}`;
        element.srclang = track.lang || 'und'; element.src = track.uri || track.url;
        element.onerror = () => {
          if (this.selected === `external:${index}`) { this.select(-1); this.onError?.(track); }
        };
        this.video.appendChild(element); element.track.mode = 'disabled';
        return {...track, id: `external:${index}`, element};
      });
      if (previous) {
        const match = this.tracks.find(track => track.name === previous.name && track.lang === previous.lang);
        if (match) this.select(match.id);
      }
    }
    select(id) {
      this.selected = this.tracks.some(t => t.id === id) ? id : -1;
      this.tracks.forEach(t => {
        if (t.id === this.selected && t.element.readyState === 3) t.element.src = t.uri || t.url;
        t.element.track.mode = t.id === this.selected ? 'showing' : 'disabled';
      });
    }
    clear() {
      this.select(-1); this.tracks.forEach(t => t.element.remove());
      this.tracks = []; this.signature = ''; this.selected = -1;
    }
  }
  root.ExternalSubtitleTracks = ExternalSubtitleTracks;
})(typeof module === 'object' ? module.exports : window);
