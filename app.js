const API_BASE = 'https://iptv-org.github.io/api';

const state = {
    channels: [], // All playable channels
    filteredChannels: [], // Channels matching current filters
    regions: [],
    categories: [],
    countries: {}, // Map country code -> region code (or just use regions data)
    filters: {
        search: '',
        region: 'all',
        category: 'all'
    },
    pagination: {
        currentPage: 1,
        itemsPerPage: 60
    }
};

// DOM Elements
const elements = {
    grid: document.getElementById('channel-grid'),
    regionSelect: document.getElementById('region-select'),
    typeSelect: document.getElementById('type-select'),
    searchInput: document.getElementById('search'),
    channelCount: document.getElementById('channel-count'),
    prevBtn: document.getElementById('prev-page'),
    nextBtn: document.getElementById('next-page'),
    pageInfo: document.getElementById('page-info'),
    modal: document.getElementById('player-modal'),
    video: document.getElementById('video-player'),
    closeModal: document.querySelector('.close-modal'),
    modalTitle: document.getElementById('player-channel-name'),
    modalMeta: document.getElementById('player-channel-meta')
};

// HLS Instance
let hls = null;

async function init() {
    try {
        await fetchData();
        setupFilters();
        setupEventListeners();
        applyFilters();
    } catch (error) {
        console.error('Initialization failed:', error);
        elements.grid.innerHTML = `<div class="loading-state"><p>Error loading data. Please try again later.</p></div>`;
    }
}

async function fetchData() {
    const [channelsRes, streamsRes, regionsRes, categoriesRes] = await Promise.all([
        fetch(`${API_BASE}/channels.json`),
        fetch(`${API_BASE}/streams.json`),
        fetch(`${API_BASE}/regions.json`),
        fetch(`${API_BASE}/categories.json`)
    ]);

    const channelsData = await channelsRes.json();
    const streamsData = await streamsRes.json();
    state.regions = await regionsRes.json();
    state.categories = await categoriesRes.json();

    processData(channelsData, streamsData);
}

function processData(channels, streams) {
    // Create a map of channels for O(1) lookup
    const channelsMap = new Map(channels.map(c => [c.id, c]));

    // Process streams and link to channels
    const playableChannels = [];
    const seenChannels = new Set();

    for (const stream of streams) {
        // Skip if no channel ID or if we already have this channel (simple deduplication)
        // Also skip non-HTTPS streams to prevent Mixed Content errors
        if (!stream.channel || seenChannels.has(stream.channel) || !stream.url.startsWith('https://')) continue;

        const channel = channelsMap.get(stream.channel);
        if (channel) {
            playableChannels.push({
                ...channel,
                streamUrl: stream.url,
                streamUserAgent: stream.user_agent,
                streamReferrer: stream.referrer
            });
            seenChannels.add(stream.channel);
        }
    }

    state.channels = playableChannels;
    state.filteredChannels = playableChannels;

    // Sort alphabetically by name
    state.channels.sort((a, b) => a.name.localeCompare(b.name));
}

function setupFilters() {
    // Populate Regions
    state.regions.forEach(region => {
        const option = document.createElement('option');
        option.value = region.code;
        option.textContent = region.name;
        elements.regionSelect.appendChild(option);
    });

    // Populate Categories
    state.categories.sort((a, b) => a.name.localeCompare(b.name)).forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        elements.typeSelect.appendChild(option);
    });
}

function setupEventListeners() {
    elements.searchInput.addEventListener('input', (e) => {
        state.filters.search = e.target.value.toLowerCase();
        state.pagination.currentPage = 1;
        applyFilters();
    });

    elements.regionSelect.addEventListener('change', (e) => {
        state.filters.region = e.target.value;
        state.pagination.currentPage = 1;
        applyFilters();
    });

    elements.typeSelect.addEventListener('change', (e) => {
        state.filters.category = e.target.value;
        state.pagination.currentPage = 1;
        applyFilters();
    });

    elements.prevBtn.addEventListener('click', () => {
        if (state.pagination.currentPage > 1) {
            state.pagination.currentPage--;
            renderGrid();
        }
    });

    elements.nextBtn.addEventListener('click', () => {
        const maxPage = Math.ceil(state.filteredChannels.length / state.pagination.itemsPerPage);
        if (state.pagination.currentPage < maxPage) {
            state.pagination.currentPage++;
            renderGrid();
        }
    });

    elements.closeModal.addEventListener('click', closePlayer);
    elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) closePlayer();
    });
}

function applyFilters() {
    const { search, region, category } = state.filters;

    // Helper to get countries for a region
    let regionCountries = null;
    if (region !== 'all') {
        const regionData = state.regions.find(r => r.code === region);
        regionCountries = regionData ? new Set(regionData.countries) : null;
    }

    state.filteredChannels = state.channels.filter(channel => {
        // Search Filter
        if (search && !channel.name.toLowerCase().includes(search)) return false;

        // Region Filter
        if (region !== 'all' && regionCountries) {
            if (!regionCountries.has(channel.country)) return false;
        }

        // Category Filter
        if (category !== 'all') {
            if (!channel.categories || !channel.categories.includes(category)) return false;
        }

        return true;
    });

    elements.channelCount.textContent = `${state.filteredChannels.length} channels found`;
    renderGrid();
}

function renderGrid() {
    elements.grid.innerHTML = '';

    const { currentPage, itemsPerPage } = state.pagination;
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageItems = state.filteredChannels.slice(start, end);

    if (pageItems.length === 0) {
        elements.grid.innerHTML = `<div class="loading-state"><p>No channels found matching your criteria.</p></div>`;
        updatePagination(0);
        return;
    }

    pageItems.forEach(channel => {
        const card = document.createElement('div');
        card.className = 'channel-card';
        card.onclick = () => openPlayer(channel);

        const logo = channel.logo
            ? `<img src="${channel.logo}" alt="${channel.name}" class="channel-logo" loading="lazy" onerror="this.classList.add('placeholder'); this.src=''; this.innerHTML='📺'">`
            : `<div class="channel-logo placeholder">📺</div>`;

        const category = channel.categories && channel.categories.length > 0
            ? channel.categories[0]
            : 'General';

        card.innerHTML = `
            ${logo}
            <div class="channel-name" title="${channel.name}">${channel.name}</div>
            <div class="channel-category">${category}</div>
        `;

        elements.grid.appendChild(card);
    });

    updatePagination(Math.ceil(state.filteredChannels.length / itemsPerPage));
}

function updatePagination(totalPages) {
    elements.pageInfo.textContent = `Page ${state.pagination.currentPage} of ${totalPages || 1}`;
    elements.prevBtn.disabled = state.pagination.currentPage === 1;
    elements.nextBtn.disabled = state.pagination.currentPage >= totalPages || totalPages === 0;
}

function openPlayer(channel) {
    elements.modal.classList.remove('hidden');
    elements.modalTitle.textContent = channel.name;
    elements.modalMeta.textContent = `${channel.categories?.[0] || 'General'} • ${channel.country}`;

    if (Hls.isSupported()) {
        if (hls) {
            hls.destroy();
        }
        hls = new Hls();
        hls.loadSource(channel.streamUrl);
        hls.attachMedia(elements.video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            elements.video.play().catch(e => console.log('Auto-play prevented:', e));
        });
    } else if (elements.video.canPlayType('application/vnd.apple.mpegurl')) {
        elements.video.src = channel.streamUrl;
        elements.video.addEventListener('loadedmetadata', () => {
            elements.video.play().catch(e => console.log('Auto-play prevented:', e));
        });
    } else {
        alert('Your browser does not support HLS playback.');
    }
}

function closePlayer() {
    elements.modal.classList.add('hidden');
    elements.video.pause();
    elements.video.src = '';
    if (hls) {
        hls.destroy();
        hls = null;
    }
}

// Start the app
init();
