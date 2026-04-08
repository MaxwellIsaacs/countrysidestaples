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
  drawer.style.cssText = 'display:none;position:fixed;top:0;right:0;width:400px;max-width:90vw;height:100vh;background:#F6F3EF;z-index:201;box-shadow:-4px 0 24px rgba(0,0,0,0.08);flex-direction:column;overflow:hidden;';

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
      .search-overlay{position:fixed;inset:0;z-index:200;background:rgba(246,243,239,0.97);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);opacity:0;visibility:hidden;transition:opacity .3s ease,visibility .3s ease;display:flex;flex-direction:column}
      .search-overlay.open{opacity:1;visibility:visible}
      .search-header{display:flex;align-items:center;gap:16px;padding:0 48px;height:64px;border-bottom:1px solid rgba(28,26,23,0.08);flex-shrink:0}
      .search-header svg{width:18px;height:18px;stroke:#8A8378;stroke-width:1.4;fill:none;flex-shrink:0}
      .search-header input{flex:1;background:none;border:none;outline:none;font-family:'EB Garamond',serif;font-size:24px;font-weight:400;color:#1C1A17;letter-spacing:-.3px}
      .search-header input::placeholder{color:rgba(28,26,23,0.2)}
      .search-close{background:none;border:none;cursor:pointer;font-size:14px;font-weight:300;color:#8A8378;width:32px;height:32px;display:flex;align-items:center;justify-content:center;transition:color .2s}
      .search-close:hover{color:#1C1A17}
      .search-body{flex:1;overflow-y:auto;padding:32px 48px}
      .search-section-label{font-size:9px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:rgba(28,26,23,0.3);margin-bottom:16px}
      .search-products{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
      .search-product{cursor:pointer;text-decoration:none;color:#1C1A17}
      .search-product .sp-img{aspect-ratio:3/4;overflow:hidden;background:#EEEAE4;margin-bottom:10px}
      .search-product .sp-img img{width:100%;height:100%;object-fit:cover;transition:transform .6s ease}
      .search-product:hover .sp-img img{transform:scale(1.03)}
      .search-product h4{font-size:12px;font-weight:400}
      .search-product .sp-price{font-family:'EB Garamond',serif;font-size:14px;margin-top:3px;color:#8A8378}
      .search-empty{text-align:center;padding:80px 0;color:#8A8378;font-size:14px;font-weight:300}
      @media(max-width:640px){.search-header{padding:0 20px}.search-body{padding:24px 20px}.search-products{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  const el = document.createElement('div');
  el.id = 'searchOverlay';
  el.className = 'search-overlay';
  el.innerHTML = `
    <div class="search-header">
      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
      <input type="text" id="searchInput" placeholder="Search" autocomplete="off">
      <button class="search-close" id="searchClose">ESC</button>
    </div>
    <div class="search-body">
      <div class="search-section-label">Products</div>
      <div class="search-products" id="searchResults"></div>
      <div class="search-empty" id="searchEmpty" style="display:none;">No results found</div>
    </div>`;
  document.body.appendChild(el);

  document.getElementById('searchClose').addEventListener('click', closeSearch);
  document.getElementById('searchInput').addEventListener('input', (e) => filterSearch(e.target.value));
}

function openSearch() {
  createSearchOverlay();
  loadSearchProducts();
  document.getElementById('searchOverlay').classList.add('open');
  setTimeout(() => document.getElementById('searchInput').focus(), 100);
}

function closeSearch() {
  const overlay = document.getElementById('searchOverlay');
  if (overlay) overlay.classList.remove('open');
  const input = document.getElementById('searchInput');
  if (input) { input.value = ''; filterSearch(''); }
}

function loadSearchProducts() {
  if (searchProducts) return;
  fetch('/api/storefront/products')
    .then(r => r.json())
    .then(products => {
      searchProducts = products;
      const el = document.getElementById('searchResults');
      if (!el) return;
      el.innerHTML = products.map(p => {
        const price = '$' + (p.price_cents / 100).toFixed(0);
        return `<a href="product.html?slug=${encodeURIComponent(p.slug)}" class="search-product" data-name="${p.name} ${p.detail || ''} ${p.category || ''}">
          <div class="sp-img"><img src="${p.image_primary}" alt="${p.name}"></div>
          <h4>${p.name}</h4>
          <div class="sp-price">${price}</div>
        </a>`;
      }).join('');
    })
    .catch(() => {});
}

function filterSearch(q) {
  const items = document.querySelectorAll('#searchResults .search-product');
  const empty = document.getElementById('searchEmpty');
  let visible = 0;
  items.forEach(item => {
    const match = !q || item.dataset.name.toLowerCase().includes(q.toLowerCase());
    item.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  if (empty) empty.style.display = visible === 0 ? '' : 'none';
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
