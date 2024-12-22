// ==UserScript==
// @name         Web Waiter - Website Info
// @namespace
// @version      0.8
// @description  A stupid web inspector that extracts metadata, favicons, theme colors, and social images. Perfect for developers and analysts to quickly analyze websites.
// @author       Legacy Wolf
// @match        *://*/*
// @grant        GM_setClipboard
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    const UI = {
        createButton(text, onClick) {
            const btn = document.createElement('button');
            btn.innerHTML = text;
            btn.style.cssText = `
                margin-left: 10px;
                padding: 2px 8px;
                background: #2196F3;
                color: white;
                border: none;
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
                transition: background 0.3s;
            `;
            btn.onmouseover = () => btn.style.background = '#1976D2';
            btn.onmouseout = () => btn.style.background = '#2196F3';
            btn.onclick = onClick;
            return btn;
        },

        createCopyButton(text) {
            return this.createButton('复制', (e) => {
                e.stopPropagation();
                GM_setClipboard(text);
                const btn = e.target;
                btn.innerHTML = '已复制';
                setTimeout(() => btn.innerHTML = '复制', 1000);
            });
        }
    };

    class ImageHandler {
        static async getDimensions(url) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = function () {
                    resolve({
                        width: this.width,
                        height: this.height,
                        size: `${this.width}x${this.height}`
                    });
                };
                img.onerror = () => resolve({ width: 0, height: 0, size: '获取失败' });
                img.src = url;
            });
        }

        static download(url, filename) {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'blob',
                onload: function (response) {
                    const blob = response.response;
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = filename || 'favicon.ico';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(link.href);
                }
            });
        }
    }

    class MetaExtractor {
        static getMetaContent(name, property) {
            const meta = document.querySelector(`meta[name="${name}"], meta[property="${property || name}"]`);
            return meta?.content;
        }

        static getSocialImages() {
            const socialImages = {
                'Open Graph': this.getMetaContent('og:image', 'og:image'),
                'Twitter Card': this.getMetaContent('twitter:image', 'twitter:image'),
                'Schema.org': this.getMetaContent('image', 'image'),
                'Microsoft Tile': this.getMetaContent('msapplication-TileImage'),
                'Apple Touch': document.querySelector('link[rel="apple-touch-icon"]')?.href,
                'Article Image': this.getMetaContent('article:image', 'article:image')
            };

            return Object.fromEntries(
                Object.entries(socialImages)
                    .filter(([_, value]) => value != null && value !== '')
                    .map(([key, value]) => [key, this.normalizeUrl(value)])
            );
        }

        static normalizeUrl(url) {
            if (!url) return null;
            if (url.startsWith('//')) return `https:${url}`;
            if (url.startsWith('/')) return `${window.location.origin}${url}`;
            if (!url.startsWith('http')) return `${window.location.origin}/${url}`;
            return url;
        }

        static getBasicInfo() {
            const info = {
                url: window.location.href,
                title: document.title || null,
                description: this.getMetaContent('description'),
                keywords: this.getMetaContent('keywords'),
                robots: this.getMetaContent('robots'),
                charset: document.charset || document.characterSet,
                generator: this.getMetaContent('generator'),
                author: this.getMetaContent('author'),
                copyright: this.getMetaContent('copyright'),
                language: document.documentElement.lang || this.getMetaContent('language')
            };

            return Object.fromEntries(
                Object.entries(info).filter(([_, value]) => value != null && value !== '')
            );
        }

        static extractThemeColors() {
            const selectors = [
                '[class*="primary"],[class*="brand"],[class*="theme"],[class*="accent"]',
                '.btn,.button,[type="submit"],[class*="cta"],[class*="highlight"]',
                'header,nav,.logo,.nav,.menu',
                '[class*="active"],[class*="selected"],[class*="current"]',
                '.badge,.tag,.label'
            ].join(',');

            function rgbToHex(color) {
                const rgb = color.match(/\d+/g).map(Number);
                if (rgb.length === 4 && rgb[3] / 255 < 0.5) return null;
                return '#' + rgb.slice(0, 3).map(x => {
                    const hex = x.toString(16);
                    return hex.length === 1 ? '0' + hex : hex;
                }).join('').toUpperCase();
            }

            function isValidColor(color) {
                if (!color || color === 'transparent' || color.includes('rgba(0, 0, 0, 0)')) return false;
                const rgb = color.match(/\d+/g)?.map(Number);
                if (!rgb || rgb.length < 3) return false;

                const [r, g, b] = rgb;
                const alpha = rgb[3] === undefined ? 1 : rgb[3] / 255;

                return !(
                    alpha < 0.5 ||
                    Math.abs(r - g) < 20 && Math.abs(g - b) < 20 && Math.abs(r - b) < 20 ||
                    r > 240 && g > 240 && b > 240 ||
                    r < 15 && g < 15 && b < 15
                );
            }

            const colors = new Set();
            document.querySelectorAll(selectors).forEach(el => {
                const style = window.getComputedStyle(el);
                ['backgroundColor', 'color', 'borderColor'].forEach(prop => {
                    const color = style[prop];
                    if (isValidColor(color)) {
                        const hex = rgbToHex(color);
                        if (hex) colors.add(hex);
                    }
                });
            });

            return [...colors].slice(0, 8);
        }

        static getValueableInfo() {
            const info = {
                rssFeeds: Array.from(document.querySelectorAll('link[type="application/rss+xml"]'))
                    .map(link => link.href)
                    .filter(Boolean),
                sitemaps: Array.from(document.querySelectorAll('link[rel="sitemap"]'))
                    .map(link => link.href)
                    .filter(Boolean),
                hasGoogleAnalytics: document.querySelector('script[src*="google-analytics.com"], script[src*="gtag"]') ? '是' : null,
                securityHeaders: { https: window.location.protocol === 'https:' },
                themeColors: this.extractThemeColors(),
                socialImages: this.getSocialImages()
            };
        
            // Only attempt basic sitemap URL checks if no sitemap links were found
            if (info.sitemaps.length === 0) {
                const commonSitemapPaths = ['sitemap.xml', 'sitemap_index.xml', 'sitemap/'];
                const baseUrl = window.location.origin;
                
                // Simple HEAD request to check if sitemap exists
                for (const path of commonSitemapPaths) {
                    const url = `${baseUrl}/${path}`;
                    try {
                        const xhr = new XMLHttpRequest();
                        xhr.open('HEAD', url, false);  // Synchronous request
                        xhr.send();
                        if (xhr.status === 200) {
                            info.sitemaps.push(url);
                            break;  // Stop checking after finding first valid sitemap
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }
        
            // If no sitemaps found, delete the property
            if (info.sitemaps.length === 0) {
                delete info.sitemaps;
            }
        
            return info;
        }
    }

    class SiteInfoUI {
        static async init() {
            const metaInfo = MetaExtractor.getBasicInfo();
            const valueableInfo = MetaExtractor.getValueableInfo();

            let iconUrls = Array.from(document.querySelectorAll('link[rel*="icon"]'))
                .map(link => link.href)
                .filter(Boolean);

            if (!iconUrls.length) {
                iconUrls.push(`${window.location.origin}/favicon.ico`);
            }

            iconUrls = [...new Set(iconUrls)];

            const iconsWithDimensions = await Promise.all(
                iconUrls.map(async url => ({
                    url,
                    dimensions: await ImageHandler.getDimensions(url)
                }))
            );

            this.showPreview({
                meta: metaInfo,
                valuable: valueableInfo,
                icons: iconsWithDimensions.filter(icon => icon.dimensions.size !== '获取失败'),
                url: window.location.href
            });
        }

        static createSection(title, items) {
            const filteredItems = Object.fromEntries(
                Object.entries(items).filter(([_, value]) => {
                    if (Array.isArray(value)) {
                        return value.length > 0;
                    }
                    return value !== null && value !== undefined && value !== '';
                })
            );

            if (!filteredItems || Object.keys(filteredItems).length === 0) return null;

            const section = document.createElement('div');
            section.style.cssText = 'margin-bottom: 20px;';
            section.innerHTML = `<h4 style="margin: 0 0 10px 0; color: #666;">${title}</h4>`;

            const itemsDiv = document.createElement('div');
            itemsDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

            Object.entries(filteredItems).forEach(([key, value]) => {
                const item = document.createElement('div');
                item.style.cssText = 'display: flex; align-items: flex-start;';

                if (key === 'themeColors') {
                    this.appendThemeColors(item, value);
                } else {
                    this.appendRegularItem(item, key, value);
                }

                itemsDiv.appendChild(item);
            });

            section.appendChild(itemsDiv);
            return section;
        }

        static appendThemeColors(container, colors) {
            container.style.cssText = 'display: flex; align-items: center;';

            const label = document.createElement('div');
            label.style.cssText = 'min-width: 120px; font-weight: 500; color: #666;';
            label.textContent = '主题色：';
            container.appendChild(label);

            const colorsDiv = document.createElement('div');
            colorsDiv.style.cssText = 'display: flex; gap: 10px; flex: 1;';

            colors.forEach(color => {
                const colorBox = document.createElement('div');
                colorBox.style.cssText = `
                    width: 50px;
                    height: 25px;
                    background-color: ${color};
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    cursor: pointer;
                    position: relative;
                `;
                colorBox.title = color;
                colorBox.onclick = () => {
                    GM_setClipboard(color);
                    const tooltip = document.createElement('div');
                    tooltip.textContent = color;
                    tooltip.style.cssText = `
                        position: absolute;
                        bottom: 100%;
                        left: 50%;
                        transform: translateX(-50%);
                        background: rgba(0,0,0,0.7);
                        color: white;
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 12px;
                        white-space: nowrap;
                    `;
                    colorBox.appendChild(tooltip);
                    setTimeout(() => tooltip.remove(), 1000);
                };
                colorsDiv.appendChild(colorBox);
            });

            container.appendChild(colorsDiv);
        }

        static appendRegularItem(container, key, value) {
            let displayValue = Array.isArray(value) ? value.join(', ') : value;
            if (typeof displayValue === 'object') {
                displayValue = JSON.stringify(displayValue, null, 2);
            }
            if (displayValue === true) displayValue = '是';
            if (displayValue === false) displayValue = '否';

            container.innerHTML = `
                <div style="min-width: 120px; font-weight: 500; color: #666;">${key}：</div>
                <div style="flex: 1; word-break: break-all; color: #333">${displayValue}</div>
            `;

            if (typeof displayValue === 'string' && !['是', '否'].includes(displayValue)) {
                container.appendChild(UI.createCopyButton(displayValue));
            }
        }

        static addSocialImages(designSection, socialImages) {
            if (!Object.keys(socialImages).length) return;

            const socialImagesDiv = document.createElement('div');
            socialImagesDiv.style.cssText = 'margin-top: 20px;';
            // socialImagesDiv.innerHTML = '<h5 style="margin: 0 0 10px 0; color: #666;">社交分享图片</h5>';

            const imagesGrid = document.createElement('div');
            imagesGrid.style.cssText = `
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                gap: 15px;
            `;

            Object.entries(socialImages).forEach(async ([type, url]) => {
                const dimensions = await ImageHandler.getDimensions(url);
                if (dimensions.size === '获取失败') return;

                const imageCard = document.createElement('div');
                imageCard.style.cssText = `
                    background: #f8f9fa;
                    padding: 10px;
                    border-radius: 8px;
                    text-align: center;
                    transition: transform 0.2s;
                    cursor: pointer;
                `;
                imageCard.onmouseover = () => imageCard.style.transform = 'scale(1.05)';
                imageCard.onmouseout = () => imageCard.style.transform = 'scale(1)';
                imageCard.onclick = () => ImageHandler.download(url, `social-${type.toLowerCase()}.jpg`);

                imageCard.innerHTML = `
                    <img src="${url}" style="width: 100%; height: 100px; object-fit: contain; margin-bottom: 8px;">
                    <div style="font-size: 11px; color: #666; margin-bottom: 4px;">${type}</div>
                    <div style="font-size: 11px; color: #888;">${dimensions.size}</div>
                `;
                imagesGrid.appendChild(imageCard);
            });

            socialImagesDiv.appendChild(imagesGrid);
            designSection.appendChild(socialImagesDiv);
        }

        static showPreview(info) {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.3);
                z-index: 10000;
            `;

            const preview = document.createElement('div');
            preview.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                padding: 25px;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                z-index: 10001;
                max-width: 800px;
                width: 90%;
                max-height: 85vh;
                overflow: auto;
            `;

            const closePanel = () => {
                document.body.removeChild(overlay);
                document.body.removeChild(preview);
            };

            overlay.addEventListener('click', closePanel);

            preview.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            const content = document.createElement('div');
            content.style.cssText = 'display: flex; flex-direction: column; gap: 20px;';
            content.innerHTML = `
                <div style="border-bottom: 1px solid #eee; padding-bottom: 15px;">
                    <h3 style="margin: 0; color: #333;">Web Waiter 🤵</h3>
                </div>
            `;

            [
                ['1️⃣ 基础信息', {
                    '网址': info.meta.url,
                    ...(info.meta.title ? { '标题': info.meta.title } : {}),
                    ...(info.meta.description ? { '描述': info.meta.description } : {}),
                    ...(info.meta.keywords ? { '关键词': info.meta.keywords } : {}),
                    ...(info.meta.robots ? { 'Robots': info.meta.robots } : {}),
                    ...(info.meta.charset ? { '字符编码': info.meta.charset } : {}),
                    ...(info.meta.language ? { '语言': info.meta.language } : {})
                }],
                ['2️⃣ 扩展信息', {
                    ...(info.valuable.rssFeeds?.length ? { 'RSS订阅': info.valuable.rssFeeds } : {}),
                    ...(info.valuable.sitemaps?.length ? { '站点地图': info.valuable.sitemaps } : {}),
                    ...(info.valuable.hasGoogleAnalytics ? { 'Google Analytics': info.valuable.hasGoogleAnalytics } : {}),
                    ...(info.meta.author ? { '作者': info.meta.author } : {}),
                    ...(info.meta.copyright ? { '版权': info.meta.copyright } : {}),
                    ...(info.meta.generator ? { '生成器': info.meta.generator } : {}),
                    // ...(info.valuable.techStack?.length ? { '技术栈': info.valuable.techStack } : {}),
                    ...(info.valuable.securityHeaders?.https ? { 'HTTPS': info.valuable.securityHeaders.https } : {})
                }],
            ].forEach(([title, items]) => {
                const section = this.createSection(title, items);
                if (section) content.appendChild(section);
            });

            const designSection = document.createElement('div');
            designSection.innerHTML = '<h4 style="margin: 0 0 10px 0; color: #666;">3️⃣ 设计信息</h4>';

            if (info.valuable.themeColors?.length) {
                const themeColorsDiv = document.createElement('div');
                this.appendThemeColors(themeColorsDiv, info.valuable.themeColors);
                designSection.appendChild(themeColorsDiv);
            }

            if (info.icons?.length) {
                const sortedIcons = [...info.icons].sort((a, b) => {
                    const aSize = a.dimensions.width * a.dimensions.height;
                    const bSize = b.dimensions.width * b.dimensions.height;
                    return bSize - aSize;
                });

                const iconsGrid = document.createElement('div');
                iconsGrid.style.cssText = `
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
                    gap: 15px;
                    margin-top: 15px;
                `;

                sortedIcons.forEach(icon => {
                    const iconCard = document.createElement('div');
                    iconCard.style.cssText = `
                        background: #f8f9fa;
                        padding: 10px;
                        border-radius: 8px;
                        text-align: center;
                        transition: transform 0.2s;
                        cursor: pointer;
                    `;
                    iconCard.onmouseover = () => iconCard.style.transform = 'scale(1.05)';
                    iconCard.onmouseout = () => iconCard.style.transform = 'scale(1)';
                    iconCard.onclick = () => ImageHandler.download(icon.url);

                    iconCard.innerHTML = `
                        <img src="${icon.url}" style="max-width: 48px; max-height: 48px; margin-bottom: 8px;">
                        <div style="font-size: 12px; color: #666;">${icon.dimensions.size}</div>
                    `;
                    iconsGrid.appendChild(iconCard);
                });

                designSection.appendChild(iconsGrid);
            }

            // Add social images
            if (Object.keys(info.valuable.socialImages || {}).length) {
                this.addSocialImages(designSection, info.valuable.socialImages);
            }

            content.appendChild(designSection);

            const closeButton = UI.createButton('关闭', closePanel);
            closeButton.style.cssText += `
                align-self: flex-end;
                margin-top: 20px;
                background: #f44336;
            `;
            closeButton.onmouseover = () => closeButton.style.background = '#d32f2f';
            closeButton.onmouseout = () => closeButton.style.background = '#f44336';
            content.appendChild(closeButton);

            preview.appendChild(content);

            document.body.appendChild(overlay);
            document.body.appendChild(preview);
        }
    }

    const floatingButton = UI.createButton('🛎️', () => SiteInfoUI.init());
    floatingButton.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        z-index: 10000;
        padding: 10px 15px;
        background-color: rgba(255, 255, 255, 0.5);
        border: none;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.3s;
    `;
    floatingButton.onmouseover = () => floatingButton.style.background = '#4b5563';
    floatingButton.onmouseout = () => floatingButton.style.background = 'rgba(255, 255, 255, 0.5)';

    document.body.appendChild(floatingButton);
})();
