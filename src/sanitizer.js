(async function () {
    ('use strict');

    const LOG = false;
    const DEFAULT_SETTINGS = { banned: [], isPopularIgnored: false };

    /**
     * Logs message to console if log flag is true
     * @param {string} message Message to log
     */
    function log(...message) {
        LOG && console.log(...message);
    }

    /**
     * Compares two strings ignoring case
     * @param {string} v1 First argument
     * @param {string} v2 Second argument
     */
    function equalsCaseInsensetive(v1, v2) {
        return (v1 || '').toString().toLowerCase() === (v2 || '').toString().toLowerCase();
    }

    /**
     * Checks if article belongs to particular user
     * @param {HTMLElement} article
     * @returns {boolean}
     */
    function belongsToAuthor(article, authorName) {
        return article == null
            ? false
            : equalsCaseInsensetive(article.querySelector(`.user-info__nickname`)?.textContent, authorName);
    }

    /**
     * Checks if article belongs to particular blog
     * @param {HTMLElement} article
     * @returns {boolean}
     */
    function belongsToBlog(article, blogName) {
        return article == null
            ? false
            : article.querySelector(`.post__title a`)?.href?.toLowerCase()?.includes(`/company/${blogName}`);
    }

    /**
     * Checks if article belongs to particular hub
     * @param {HTMLElement} article
     * @returns {boolean}
     */
    function belongsToHab(article, searchTerm) {
        return [...(article?.querySelectorAll('.hub-link') ?? [])].some(
            (el) => el.innerText?.toLowerCase() === searchTerm || el.href?.toLowerCase()?.includes(`/hub/${searchTerm}`)
        );
    }

    /**
     * Gets banned authors from the store
     */
    async function getSettings() {
        return new Promise((resolve, _) => {
            chrome.storage.sync.get('settings', (data) => {
                const settings = data && data.settings && data.settings.banned ? data.settings : DEFAULT_SETTINGS;
                resolve(settings);
            });
        });
    }

    /**
     * Removes links from reading now block
     * @param {number[]} ids
     */
    function removeLinksFromReadingNow(ids) {
        const [...list] = document.querySelectorAll('#neuro-habr .content-list__item');
        const banned = list.filter((x) => {
            const href = (x.querySelector('.post-info__title')?.href ?? '').toLowerCase();
            const containsBannedId = ids.some((id) => href.includes(`post/${id}`));
            return containsBannedId;
        });

        banned.forEach((x) => (x.innerHTML = `<!-- removed-->`));
    }

    /**
     * Extracts article id from href
     * @param {string} href
     * @returns number
     */
    function extractArticleId(href) {
        if (href == null) {
            return NaN;
        }

        const trimmed = href.endsWith('/') ? href.slice(0, -1) : href;
        return trimmed.split('/').pop();
    }

    function onPersonalPage(name) {
        const location = window.location.href.toLowerCase();
        const isOnAuthorPage = location.includes(`/users/${name}/posts`);
        const isOnBlogPage = location.includes(`/company/${name}/blog`);
        return isOnAuthorPage || isOnBlogPage;
    }

    /**
     * Gets id of the banned articles
     * @param {HTMLElement[]} articles
     * @param {string[]} banned list of banned authors/blogs
     */
    function getIdForBannedArticles(articles, banned) {
        return articles
            .filter((article) =>
                banned.some((searchTerm) => belongsToAuthor(article, searchTerm) || belongsToHab(article, searchTerm))
            )
            .map((article) => extractArticleId(article.querySelector('.post__title a')?.href));
    }

    /**
     * Removes article from regular list by author name
     * @param {string} author
     * @param {HTMLElement[]} articles
     */
    function removeArticle(author, articles) {
        const searchTerm = (author ?? '').toString().toLowerCase();

        const isOnPersonalPage = onPersonalPage(author);

        if (isOnPersonalPage) {
            log(`We are on the ${searchTerm} personal page, skipping`);
            return;
        }

        const articlesToBeDeleted = articles.filter(
            (article) =>
                belongsToAuthor(article, searchTerm) ||
                belongsToBlog(article, searchTerm) ||
                belongsToHab(article, searchTerm)
        );

        log(`Found ${articlesToBeDeleted.length} articles to ban from ${searchTerm}`);

        articlesToBeDeleted.forEach((article) => article.classList.add('sanitizer-hidden-article'));
    }

    /**
     * Gets all visible (not banned) articles
     */
    function get_visible_articles() {
        return [...document.querySelectorAll('article:not(.post_full):not(.sanitizer-hidden-article)')];
    }

    /**
     * Add remove action button (link) to each hub link of article
     * @param {HTMLElement[]} article
     */
    function addContentActions(article) {
        article.querySelectorAll('a.hub-link').forEach(a => {
            const remove_link = document.createElement('button');
            remove_link.className = 'sanitizer-action-remove-hub';
            remove_link.title = 'Add this hub to HabroSanitizer banned list';
            remove_link.innerHTML = '&times;';
            remove_link.onclick = addHubToBanned;
            a.insertAdjacentElement('afterend', remove_link);
        });
    }

    /**
     * Event handler for append hub name to ban list and hide all related visible articles
     * @param {Event[]} click event
     */
    function addHubToBanned(event) {
        const a = event.currentTarget.previousElementSibling, hubname = a.textContent.toLocaleLowerCase();
        settings.banned.push({ name: hubname, disabled: false });
        chrome.storage.sync.set({ settings }, () => removeArticle(hubname, get_visible_articles()));
    }

    const settings = await getSettings();
    const banned = settings.banned.map(({ name }) => name);
    const isReadingNowBlockOff = settings.isPopularIgnored && false; // see #6

    log(`Found list of banned users: ${banned.join(',')} `);

    const [...allArticles] = document.querySelectorAll('article:not(.post_full)');

    if (isReadingNowBlockOff) {
        const listOfBannedId = getIdForBannedArticles(allArticles, banned);
        console.log(`Found ids for ban: "${listOfBannedId.join(',')}"`);
        removeLinksFromReadingNow(listOfBannedId);
    }

    banned.forEach((name) => removeArticle(name, allArticles));
    if ( settings.show_hub_actions )
        get_visible_articles().forEach(addContentActions); // add hub action buttons for all visible articles

    log(`Sanitization done`);
})();
