export const MEDIA_JS = `
  function renderAupMedia(node) {
    var el = document.createElement("div");
    el.className = "aup-media";
    var p = node.props || {};
    var mediaType = p.type || "image";

    if (mediaType === "avatar") {
      var avatar = document.createElement("div");
      avatar.className = "aup-avatar";
      if (p.size) avatar.setAttribute("data-size", p.size);
      var avatarSrc = String(p.src || "");
      if (avatarSrc && !avatarSrc.toLowerCase().startsWith("javascript:")) {
        var avatarImg = document.createElement("img");
        avatarImg.src = avatarSrc;
        avatarImg.alt = _escapeHtml(String(p.alt || p.name || ""));
        avatar.appendChild(avatarImg);
      } else {
        // Initials fallback
        var name = String(p.name || p.alt || "?");
        var initials = name.split(/\\s+/).map(function(w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
        avatar.textContent = initials;
      }
      el.appendChild(avatar);
    } else if (mediaType === "icon") {
      var iconName = p.name || p.content || "";
      var svgPath = _ICON_PATHS[iconName];
      if (svgPath) {
        var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        svg.classList.add("aup-icon-svg");
        svg.innerHTML = svgPath;
        el.appendChild(svg);
      } else {
        // Fallback: single letter/emoji avatar
        var icon = document.createElement("span");
        icon.className = "aup-icon";
        icon.textContent = String(iconName).slice(0, 2);
        el.appendChild(icon);
      }
    } else if (mediaType === "video") {
      var video = document.createElement("video");
      var src = String(p.src || "");
      if (src && !src.toLowerCase().startsWith("javascript:")) {
        video.src = src;
      }
      video.controls = p.controls !== false;
      if (p.autoPlay) { video.autoplay = true; video.muted = true; } // autoplay requires muted
      if (p.loop) video.loop = true;
      if (p.muted) video.muted = true;
      if (p.poster) video.poster = String(p.poster);
      if (p.fit) video.style.objectFit = p.fit;
      if (typeof p.volume === "number") video.volume = Math.max(0, Math.min(1, p.volume));
      video.playsInline = true;
      var svw = (p.size && p.size.width) || p.width;
      var svh = (p.size && p.size.height) || p.height;
      if (svw) video.style.width = typeof svw === "number" ? svw + "px" : svw;
      if (svh) video.style.height = typeof svh === "number" ? svh + "px" : svh;
      if ((svw || svh) && !p.fit) video.style.objectFit = "contain";
      el.appendChild(video);
    } else if (mediaType === "audio") {
      var audio = document.createElement("audio");
      var audioSrc = String(p.src || "");
      if (audioSrc && !audioSrc.toLowerCase().startsWith("javascript:")) {
        audio.src = audioSrc;
      }
      audio.controls = p.controls !== false;
      if (p.autoPlay) audio.autoplay = true;
      if (p.loop) audio.loop = true;
      if (p.muted) audio.muted = true;
      if (typeof p.volume === "number") audio.volume = Math.max(0, Math.min(1, p.volume));
      el.appendChild(audio);
    } else {
      // image
      var src = String(p.src || "");
      if (src && !src.toLowerCase().startsWith("javascript:")) {
        var img = document.createElement("img");
        img.src = src;
        img.alt = _escapeHtml(String(p.alt || ""));
        var sw = (p.size && p.size.width) || p.width;
        var sh = (p.size && p.size.height) || p.height;
        if (sw) img.style.width = typeof sw === "number" ? sw + "px" : sw;
        if (sh) img.style.height = typeof sh === "number" ? sh + "px" : sh;
        if (sw || sh) img.style.objectFit = "contain";
        el.appendChild(img);
      } else {
        var ph = document.createElement("div");
        ph.className = "aup-placeholder";
        ph.textContent = p.alt ? _escapeHtml(String(p.alt)) : "No image";
        el.appendChild(ph);
      }
    }
    return el;
  }

`;
