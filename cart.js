// ── Cart (localStorage) ──
// Cart items: [{ slug, name, detail, size, quantity, price_cents, image }]

function getCart() {
  try { return JSON.parse(localStorage.getItem('css_cart') || '[]'); }
  catch { return []; }
}

function saveCart(cart) {
  localStorage.setItem('css_cart', JSON.stringify(cart));
  updateCartBadge();
}

function addToCart(item) {
  const cart = getCart();
  const existing = cart.find(c => c.slug === item.slug && c.size === item.size);
  if (existing) {
    existing.quantity = Math.min(existing.quantity + (item.quantity || 1), 10);
  } else {
    cart.push({ ...item, quantity: item.quantity || 1 });
  }
  saveCart(cart);
  openCartDrawer();
}

function removeFromCart(slug, size) {
  const cart = getCart().filter(c => !(c.slug === slug && c.size === size));
  saveCart(cart);
  renderCartDrawer();
}

function updateCartQty(slug, size, delta) {
  const cart = getCart();
  const item = cart.find(c => c.slug === slug && c.size === size);
  if (!item) return;
  item.quantity = Math.max(1, Math.min(10, item.quantity + delta));
  saveCart(cart);
  renderCartDrawer();
}

function updateCartBadge() {
  const cart = getCart();
  const count = cart.reduce((sum, c) => sum + c.quantity, 0);
  let badge = document.getElementById('cartBadge');
  if (!badge) {
    const cartLink = document.querySelector('.cart-link');
    if (!cartLink) return;
    badge = document.createElement('span');
    badge.id = 'cartBadge';
    badge.style.cssText = 'position:absolute;top:-6px;right:-10px;background:#1C1A17;color:#F6F3EF;font-size:9px;font-weight:500;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;';
    cartLink.style.position = 'relative';
    cartLink.appendChild(badge);
  }
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

// ── Cart Drawer ──
function createCartDrawer() {
  if (document.getElementById('cartDrawer')) return;

  const overlay = document.createElement('div');
  overlay.id = 'cartOverlay';
  overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(28,26,23,0.25);backdrop-filter:blur(2px);z-index:200;';
  overlay.addEventListener('click', closeCartDrawer);

  const drawer = document.createElement('div');
  drawer.id = 'cartDrawer';
  drawer.style.cssText = 'display:none;position:fixed;top:0;right:0;width:400px;max-width:calc(100vw - 72px);height:100vh;background:#F6F3EF;z-index:201;box-shadow:-4px 0 24px rgba(0,0,0,0.08);flex-direction:column;overflow:hidden;';

  drawer.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:24px 28px;border-bottom:1px solid rgba(28,26,23,0.08);">
      <span style="font-family:'EB Garamond',serif;font-size:20px;">Your Cart</span>
      <button id="cartClose" style="background:none;border:none;font-size:20px;font-weight:300;cursor:pointer;color:#1C1A17;line-height:1;transform:rotate(45deg);">+</button>
    </div>
    <div id="cartItems" style="flex:1;overflow-y:auto;padding:20px 28px;"></div>
    <div id="cartFooter" style="padding:20px 28px;border-top:1px solid rgba(28,26,23,0.08);"></div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);
  document.getElementById('cartClose').addEventListener('click', closeCartDrawer);
}

function openCartDrawer() {
  createCartDrawer();
  document.getElementById('cartOverlay').style.display = 'block';
  const drawer = document.getElementById('cartDrawer');
  drawer.style.display = 'flex';
  renderCartDrawer();
}

function closeCartDrawer() {
  const overlay = document.getElementById('cartOverlay');
  const drawer = document.getElementById('cartDrawer');
  if (overlay) overlay.style.display = 'none';
  if (drawer) drawer.style.display = 'none';
}

function renderCartDrawer() {
  const cart = getCart();
  const itemsEl = document.getElementById('cartItems');
  const footerEl = document.getElementById('cartFooter');
  if (!itemsEl || !footerEl) return;

  if (cart.length === 0) {
    itemsEl.innerHTML = '<p style="text-align:center;color:#8A8378;font-size:13px;font-weight:300;padding:40px 0;">Your cart is empty</p>';
    footerEl.innerHTML = '';
    return;
  }

  itemsEl.innerHTML = cart.map(item => {
    const price = '$' + (item.price_cents / 100).toFixed(2);
    return `
      <div style="display:flex;gap:16px;padding:16px 0;border-bottom:1px solid rgba(28,26,23,0.06);">
        ${item.image ? `<img src="${item.image}" style="width:64px;height:80px;object-fit:cover;background:#EEEAE4;flex-shrink:0;">` : ''}
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:400;">${item.name}</div>
          <div style="font-size:11px;color:#8A8378;margin-top:2px;">${item.detail || ''}${item.size ? ' — ' + item.size : ''}</div>
          <div style="font-family:'EB Garamond',serif;font-size:14px;margin-top:4px;">${price}</div>
          <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
            <div style="display:flex;align-items:center;border:1px solid rgba(28,26,23,0.12);">
              <button onclick="updateCartQty('${item.slug}','${item.size}',-1)" style="width:28px;height:28px;background:none;border:none;cursor:pointer;font-size:14px;color:#1C1A17;">−</button>
              <span style="width:24px;text-align:center;font-size:12px;border-left:1px solid rgba(28,26,23,0.08);border-right:1px solid rgba(28,26,23,0.08);height:28px;line-height:28px;">${item.quantity}</span>
              <button onclick="updateCartQty('${item.slug}','${item.size}',1)" style="width:28px;height:28px;background:none;border:none;cursor:pointer;font-size:14px;color:#1C1A17;">+</button>
            </div>
            <button onclick="removeFromCart('${item.slug}','${item.size}')" style="background:none;border:none;font-size:10px;color:#8A8378;cursor:pointer;letter-spacing:1px;text-transform:uppercase;">Remove</button>
          </div>
        </div>
      </div>`;
  }).join('');

  const total = cart.reduce((sum, c) => sum + c.price_cents * c.quantity, 0);
  footerEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
      <span style="font-size:12px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;color:#8A8378;">Total</span>
      <span style="font-family:'EB Garamond',serif;font-size:18px;">$${(total / 100).toFixed(2)}</span>
    </div>
    <button onclick="checkout()" id="checkoutBtn" style="width:100%;padding:14px;background:#1C1A17;color:#F6F3EF;border:none;cursor:pointer;font-family:'Outfit',sans-serif;font-size:11px;font-weight:500;letter-spacing:2.5px;text-transform:uppercase;transition:opacity 0.2s;">
      Checkout
    </button>
  `;
}

async function checkout() {
  const cart = getCart();
  if (!cart.length) return;

  const btn = document.getElementById('checkoutBtn');
  if (btn) { btn.textContent = 'Redirecting...'; btn.disabled = true; }

  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cart.map(c => ({ slug: c.slug, size: c.size, quantity: c.quantity })),
      }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error || 'Checkout failed');
      if (btn) { btn.textContent = 'Checkout'; btn.disabled = false; }
    }
  } catch {
    alert('Checkout failed. Please try again.');
    if (btn) { btn.textContent = 'Checkout'; btn.disabled = false; }
  }
}

// ── Quick Add ──
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.quick-add');
  if (!btn || !btn.dataset.slug) return;
  e.preventDefault();
  e.stopPropagation();
  const sizes = JSON.parse(btn.dataset.sizes || '[]');
  const defaultSize = sizes.length ? sizes[Math.floor(sizes.length / 2)] : '';
  addToCart({
    slug: btn.dataset.slug,
    name: btn.dataset.name,
    detail: btn.dataset.detail,
    size: defaultSize,
    quantity: 1,
    price_cents: parseInt(btn.dataset.price),
    image: btn.dataset.image,
  });
});

// ── Search Overlay ──
let searchProducts = null;

function createSearchOverlay() {
  if (document.getElementById('searchOverlay')) return;

  // Inject search CSS if not already present
  if (!document.getElementById('searchStyles')) {
    const style = document.createElement('style');
    style.id = 'searchStyles';
    style.textContent = `
      .search-overlay{position:fixed;top:0;left:0;right:0;bottom:auto;z-index:300;background:#FFFFFF;border-bottom:1px solid rgba(28,26,23,0.12);box-shadow:0 16px 40px rgba(28,26,23,0.12);transform:translateY(-12px);opacity:0;visibility:hidden;transition:opacity .25s ease,transform .35s cubic-bezier(.2,.7,.2,1),visibility .25s ease;height:fit-content;min-height:0;display:block}
      .search-overlay > *{display:block}
      body.search-open .nav-menu-toggle{display:none}
      .search-overlay.open{opacity:1;visibility:visible;transform:translateY(0)}
      .search-close{position:absolute;top:16px;right:48px;background:none;border:none;cursor:pointer;width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:#1C1A17;z-index:301;padding:0}
      .search-close svg{width:20px;height:20px;stroke:currentColor;stroke-width:1.4;fill:none;display:block}
      .search-input-wrap{padding:64px 48px 0;position:relative}
      .search-input-row{display:flex;align-items:center;gap:24px;border-bottom:1px solid #1C1A17;padding-bottom:14px}
      .search-input-row input{flex:1;background:none;border:none;outline:none;font-family:'EB Garamond',serif;font-size:clamp(36px,5vw,64px);font-weight:400;color:#1C1A17;letter-spacing:-.01em;padding:0;line-height:1.1}
      .search-input-row input::placeholder{color:rgba(28,26,23,0.18);font-weight:400}
      .search-submit{background:none;border:none;cursor:pointer;color:#1C1A17;width:36px;height:36px;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;transition:transform .25s ease}
      .search-submit:hover{transform:translateX(4px)}
      .search-submit svg{width:24px;height:24px;stroke:currentColor;stroke-width:1.4;fill:none;display:block}
      .search-clear{background:none;border:none;cursor:pointer;color:#1C1A17;width:36px;height:36px;display:none;align-items:center;justify-content:center;flex-shrink:0;padding:0}
      .search-clear.show{display:flex}
      .search-clear svg{width:20px;height:20px;stroke:currentColor;stroke-width:1.4;fill:none;display:block}
      .search-body{padding:32px 48px 40px}
      .search-section-label{font-size:13px;font-weight:600;color:#1C1A17;margin-bottom:18px;letter-spacing:0}
      .search-results-list{display:flex;flex-direction:column;gap:14px}
      .search-result-name{font-size:22px;font-weight:600;color:#1C1A17;text-decoration:none;width:max-content;max-width:100%;transition:opacity .2s}
      .search-result-name:hover{opacity:0.55}
      .search-empty{padding:24px 0;color:#8A8378;font-size:14px;font-weight:300}
      @media(max-width:640px){.search-close{right:20px}.search-input-wrap{padding:96px 20px 0}.search-input-row input{font-size:32px}.search-body{padding:32px 20px}.search-result-name{font-size:18px}.search-submit{display:none}}
    `;
    document.head.appendChild(style);
  }

  const el = document.createElement('div');
  el.id = 'searchOverlay';
  el.className = 'search-overlay';
  el.innerHTML = `
    <button class="search-close" id="searchClose" aria-label="Close">
      <svg viewBox="0 0 24 24"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
    </button>
    <div class="search-input-wrap">
      <div class="search-input-row">
        <input type="text" id="searchInput" placeholder="Tee, hat, hoodie..." autocomplete="off">
        <button class="search-clear" id="searchClear" aria-label="Clear">
          <svg viewBox="0 0 24 24"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
        </button>
        <button class="search-submit" aria-label="Search">
          <svg viewBox="0 0 24 24"><line x1="4" y1="12" x2="20" y2="12"/><polyline points="14 6 20 12 14 18"/></svg>
        </button>
      </div>
    </div>
    <div class="search-body">
      <div class="search-section-label" id="searchLabel">Suggested</div>
      <div class="search-results-list" id="searchResults"></div>
      <div class="search-empty" id="searchEmpty" style="display:none;">No results found</div>
    </div>`;
  document.body.appendChild(el);

  document.getElementById('searchClose').addEventListener('click', closeSearch);
  document.getElementById('searchInput').addEventListener('input', (e) => filterSearch(e.target.value));
  document.getElementById('searchClear').addEventListener('click', () => {
    const input = document.getElementById('searchInput');
    input.value = '';
    filterSearch('');
    input.focus();
  });
}

function openSearch() {
  createSearchOverlay();
  loadSearchProducts();
  document.getElementById('searchOverlay').classList.add('open');
  document.body.classList.add('search-open');
  setTimeout(() => document.getElementById('searchInput').focus(), 100);
}

function closeSearch() {
  const overlay = document.getElementById('searchOverlay');
  if (overlay) overlay.classList.remove('open');
  document.body.classList.remove('search-open');
  const input = document.getElementById('searchInput');
  if (input) { input.value = ''; filterSearch(''); }
}

function loadSearchProducts() {
  if (searchProducts) { renderSearchResults(''); return; }
  fetch('/api/storefront/products')
    .then(r => r.json())
    .then(products => {
      searchProducts = products;
      renderSearchResults('');
    })
    .catch(() => {});
}

function renderSearchResults(q) {
  const list = document.getElementById('searchResults');
  const label = document.getElementById('searchLabel');
  const empty = document.getElementById('searchEmpty');
  if (!list || !searchProducts) return;
  const query = (q || '').trim().toLowerCase();
  let items;
  if (!query) {
    label.textContent = 'Suggested';
    items = searchProducts.filter(p => p.featured).slice(0, 6);
    if (items.length === 0) items = searchProducts.slice(0, 6);
  } else {
    label.textContent = 'Results';
    items = searchProducts.filter(p => {
      const hay = `${p.name} ${p.detail || ''} ${p.category || ''}`.toLowerCase();
      return hay.includes(query);
    });
  }
  list.innerHTML = items.map(p =>
    `<a href="product.html?slug=${encodeURIComponent(p.slug)}" class="search-result-name">${p.name}${p.detail ? ' — ' + p.detail : ''}</a>`
  ).join('');
  if (empty) empty.style.display = items.length === 0 ? '' : 'none';
}

function filterSearch(q) {
  const clear = document.getElementById('searchClear');
  if (clear) clear.classList.toggle('show', !!q);
  renderSearchResults(q);
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  // Wire up cart icon click
  const cartLink = document.querySelector('.cart-link');
  if (cartLink) {
    cartLink.addEventListener('click', (e) => {
      e.preventDefault();
      openCartDrawer();
    });
  }

  // Wire up search icon click
  const searchLink = document.querySelector('.search-link');
  if (searchLink) {
    searchLink.addEventListener('click', (e) => {
      e.preventDefault();
      openSearch();
    });
  }

  // Escape closes search
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearch();
  });

  updateCartBadge();
});
