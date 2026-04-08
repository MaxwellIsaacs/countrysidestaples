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
  updateCartBadge();
});
