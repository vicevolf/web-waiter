// ==UserScript==
// @name         Web Waiter - Website Info
// @namespace
// @version      0.7
// @description  A stupid web inspector that extracts metadata, favicons, theme colors, and tech stack information. Perfect for developers and analysts to quickly analyze websites.
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
            const meta = document.querySelector(`meta[name="${name}"], meta[property="${property}"]`);
            return meta?.content;
        }

        static getBasicInfo() {
            const info = {
                url: window.location.href,
                title: document.title || null,
                description: this.getMetaContent('description'),
                keywords: this.getMetaContent('keywords'),
                robots: this.getMetaContent('robots'),
                // canonical: document.querySelector('link[rel="canonical"]')?.href,
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
                sitemaps: [
                    ...Array.from(document.querySelectorAll('link[rel="sitemap"]'))
                        .map(link => link.href)
                        .filter(Boolean),
                    ...['sitemap.xml', 'sitemap_index.xml', 'sitemap/', 'sitemap.html']
                        .map(path => `${window.location.origin}/${path}`)
                ],
                techStack: [
                    // 前端框架和库
                    ((window.jQuery && typeof jQuery.fn === 'object') ||
                        document.querySelector('script[src*="jquery"], script[src*="jquery.min.js"]')) && 'jQuery',

                    ((window.React && typeof React.createElement === 'function') ||
                        document.querySelector('script[src*="react"], script[src*="react.production.min.js"]')) && 'React',

                    ((window.Vue && typeof Vue.version === 'string') ||
                        document.querySelector('script[src*="vue"], script[src*="vue.global.js"], script[src*="vue.runtime.js"]')) && 'Vue',

                    (window.angular && typeof angular.module === 'function') && 'Angular',

                    (window.Ember && typeof Ember.VERSION === 'string') && 'Ember.js',

                    (window.Backbone && typeof Backbone.Model === 'function') && 'Backbone.js',

                    document.querySelector('[ng-version]') && 'Angular',

                    document.querySelector('[sveltekit\\:data]') && 'SvelteKit',

                    document.querySelector('[data-reactroot], [data-reactid]') && 'React (Server-Side Rendered)',

                    document.querySelector('script[src*="polymer"]') && 'Polymer',

                    // CMS 和博客平台
                    (document.querySelector('script[src*="wordpress"]') ||
                        document.querySelector('script[src*="wp-content"], link[href*="wp-content"]') ||
                        document.querySelector('meta[name="generator"][content*="WordPress"]')) && 'WordPress',

                    document.querySelector('meta[content*="Drupal"]') && 'Drupal',
                    document.querySelector('script[src*="wix"]') && 'Wix',
                    document.querySelector('meta[content*="Ghost"]') && 'Ghost',
                    document.querySelector('meta[name="generator"][content*="Blogger"]') && 'Blogger',
                    document.querySelector('script[src*="zendesk"]') && 'Zendesk',
                    document.querySelector('script[src*="sitepad"]') && 'SitePad',

                    // 电商平台
                    document.querySelector('script[src*="cdn.shopify.com"]') && 'Shopify',
                    document.querySelector('meta[name="generator"][content*="Magento"]') && 'Magento',
                    (document.querySelector('script[src*="woocommerce"]') ||
                        document.querySelector('link[href*="woocommerce"], script[src*="wc-"], link[href*="wc-"]')) && 'WooCommerce',
                    document.querySelector('meta[name="generator"][content*="PrestaShop"]') && 'PrestaShop',
                    document.querySelector('meta[name="application-name"][content*="Shopware"]') && 'Shopware',
                    document.querySelector('meta[name="generator"][content*="OpenCart"]') && 'OpenCart',
                    document.querySelector('script[src*="bigcommerce"]') && 'BigCommerce',

                    // 支付工具
                    document.querySelector('script[src*="js.stripe.com"]') && 'Stripe',
                    document.querySelector('script[src*="klarna.com"]') && 'Klarna',

                    // 文档生成工具
                    document.querySelector('div[class*="swagger-ui"]') && 'Swagger UI',
                    document.querySelector('meta[content*="GitBook"]') && 'GitBook',
                    document.querySelector('meta[content*="Docusaurus"]') && 'Docusaurus',
                    document.querySelector('meta[name="generator"][content*="Sphinx"]') && 'Sphinx',
                    document.querySelector('script[src*="betterdocs"]') && 'BetterDocs',
                    document.querySelector('script[src*="mkdocs"]') && 'MkDocs',

                    // CSS 框架和 UI 工具
                    document.querySelector('link[href*="bootstrap"], link[href*="bootstrap.min.css"]') && 'Bootstrap',
                    document.querySelector('link[href*="animate.css"]') && 'Animate.css',
                    document.querySelector('link[href*="tailwind"], link[href*="tailwind.min.css"]') && 'Tailwind CSS',
                    document.querySelector('link[href*="foundation"]') && 'ZURB Foundation',
                    document.querySelector('link[href*="civictheme"]') && 'CivicTheme',
                    document.querySelector('.MuiButton-root') && 'MUI',
                    document.querySelector('[class*="uikit"]') && 'UIKit',
                    document.querySelector('[class*="el-"]') && 'Element UI',
                    document.querySelector('link[href*="material.min.css"]') && 'Material Design Lite',
                    document.querySelector('[class*="ant-"]') && 'Ant Design',

                    // 静态网站生成器
                    document.querySelector('script[src*="gatsby"], script[src*="gatsby.min.js"]') && 'Gatsby',
                    (document.querySelector('script[src*="next"], script[src*="next.min.js"]') || window.__NEXT_DATA__) && 'Next.js',
                    document.querySelector('script[src*="nuxt"], script[src*="nuxt.min.js"]') && 'Nuxt.js',
                    document.querySelector('script[src*="astro"], script[src*="astro.min.js"]') && 'Astro',
                    document.querySelector('script[src*="hugo"], script[src*="hugo.min.js"]') && 'Hugo',
                    document.querySelector('script[src*="adobe"]') && 'Adobe Muse',
                    document.querySelector('script[src*="vuepress"]') && 'VuePress',
                    document.querySelector('script[src*="vitepress"]') && 'VitePress',

                    // 测试框架
                    window.jasmine && typeof jasmine === 'object' && 'Jasmine',
                    window.mocha && typeof mocha.describe === 'function' && 'Mocha',
                    window.chai && typeof chai.assert === 'function' && 'Chai',
                    window.QUnit && typeof QUnit.test === 'function' && 'QUnit',

                    // 图表库
                    (window.Chart && typeof Chart === 'function') && 'Chart.js',
                    (window.Highcharts && typeof Highcharts.chart === 'function') && 'Highcharts',
                    (window.am4core && typeof am4core.create === 'function') && 'amCharts',
                    (typeof window.Plotly === 'object' && typeof Plotly.newPlot === 'function') && 'Plotly.js',

                    // 分析和跟踪工具
                    (window.ga && typeof ga === 'function') && 'Google Analytics',
                    (window.fbq && typeof fbq === 'function') && 'Facebook Pixel',
                    document.querySelector('script[src*="hotjar"]') && 'Hotjar',
                    document.querySelector('script[src*="mixpanel"]') && 'Mixpanel',
                    document.querySelector('script[src*="segment"]') && 'Segment',

                    // 其他工具
                    (window.firebase && typeof firebase === 'object') && 'Firebase',
                    ((window.gsap && typeof gsap.to === 'function') ||
                        (window._gsap && typeof _gsap.to === 'function')) && 'GSAP',
                    ((document.querySelector('script[src*="three"], script[src*="three.min.js"]') ||
                        (window.THREE && typeof THREE === 'object'))) && 'Three.js'
                ].filter(Boolean),
                hasGoogleAnalytics: document.querySelector('script[src*="google-analytics.com"], script[src*="gtag"]') ? '是' : null,
                securityHeaders: { https: window.location.protocol === 'https:' },
                themeColors: this.extractThemeColors()
            };
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
            // 首先过滤掉所有空值、空数组和未定义的项
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

        static showPreview(info) {
            // Create overlay
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

            // Add click event to overlay
            overlay.addEventListener('click', closePanel);

            // Prevent clicks inside the preview from closing
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

            // Add sections
            [
                ['1️⃣ 基础信息', {
                    '网址': info.meta.url,
                    ...(info.meta.title ? { '标题': info.meta.title } : {}),
                    ...(info.meta.description ? { '描述': info.meta.description } : {}),
                    ...(info.meta.keywords ? { '关键词': info.meta.keywords } : {}),
                    ...(info.meta.robots ? { 'Robots': info.meta.robots } : {}),
                    // ...(info.meta.canonical ? { '规范链接': info.meta.canonical } : {}),
                    ...(info.meta.charset ? { '字符编码': info.meta.charset } : {}),
                    ...(info.meta.language ? { '语言': info.meta.language } : {})
                }],
                ['2️⃣ 内容信息', {
                    ...(info.valuable.rssFeeds?.length ? { 'RSS订阅': info.valuable.rssFeeds } : {}),
                    ...(info.valuable.sitemaps?.length ? { '站点地图': info.valuable.sitemaps } : {}),
                    ...(info.valuable.hasGoogleAnalytics ? { 'Google Analytics': info.valuable.hasGoogleAnalytics } : {}),
                    ...(info.meta.author ? { '作者': info.meta.author } : {}),
                    ...(info.meta.copyright ? { '版权': info.meta.copyright } : {})

                }],
                ['3️⃣ 开发信息', {
                    ...(info.meta.generator ? { '生成器': info.meta.generator } : {}),
                    ...(info.valuable.techStack?.length ? { '技术栈': info.valuable.techStack } : {}),
                    ...(info.valuable.securityHeaders?.https ? { 'HTTPS': info.valuable.securityHeaders.https } : {})
                }]
            ].forEach(([title, items]) => {
                const section = this.createSection(title, items);
                if (section) content.appendChild(section);
            });

            // Add design section
            const designSection = document.createElement('div');
            designSection.innerHTML = '<h4 style="margin: 0 0 10px 0; color: #666;">4️⃣ 设计信息</h4>';

            // Add theme colors
            if (info.valuable.themeColors?.length) {
                const themeColorsDiv = document.createElement('div');
                this.appendThemeColors(themeColorsDiv, info.valuable.themeColors);
                designSection.appendChild(themeColorsDiv);
            }

            // Add icons grid
            if (info.icons?.length) {
                // Sort icons by dimensions (largest first)
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

            content.appendChild(designSection);

            // Add close button
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

            // Add both overlay and preview to the body
            document.body.appendChild(overlay);
            document.body.appendChild(preview);
        }
    }

    // Initialize the floating button
    const floatingButton = UI.createButton('🛎️', () => SiteInfoUI.init());
    floatingButton.style.cssText = `
        position: fixed;
        top: 50px;
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
