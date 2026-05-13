'use client';

import { useEffect, useRef, useState } from 'react';
import { PageShell, PageHead } from '@/components/pitch';

// ---------------------------------------------------------------------------
// Types — mirrors shape from /api/restaurants/[restaurantId]/menu
// TODO: import from src/lib/schemas/menu.ts once Michael ships it
// ---------------------------------------------------------------------------

type MenuItemRow = {
  id: string;
  name: string;
  description: string | null;
  price: string;
  imageUrl: string | null;
  allergens: string[];
  isAvailable: boolean;
  isPopular: boolean;
  sortOrder: number;
  categoryId: string | null;
};

type MenuCategoryRow = {
  id: string;
  name: string;
  sortOrder: number;
  isVisible: boolean;
  items: MenuItemRow[];
};

const ALLERGEN_OPTIONS = [
  'peanuts', 'tree nuts', 'dairy', 'gluten', 'egg',
  'shellfish', 'fish', 'soy', 'sesame',
];

const EMPTY_ITEM = {
  name: '',
  description: '',
  price: '',
  allergens: [] as string[],
  isPopular: false,
  categoryId: null as string | null,
};

export default function MenuPage() {
  const [categories, setCategories] = useState<MenuCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Add category
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [catError, setCatError] = useState('');

  // Add item modal
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemCategoryId, setAddItemCategoryId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState({ ...EMPTY_ITEM });
  const [savingItem, setSavingItem] = useState(false);
  const [itemError, setItemError] = useState('');

  // Photo upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [activeMenuCat, setActiveMenuCat] = useState<string | null>(null);

  async function loadMenu() {
    // TODO: fetch from /api/restaurants/[restaurantId]/menu once Michael ships it
    setCategories([]);
    setLoading(false);
  }

  useEffect(() => { loadMenu(); }, []);

  useEffect(() => {
    if (categories.length === 0) {
      setActiveMenuCat(null);
      return;
    }
    setActiveMenuCat((prev) =>
      prev && categories.some((c) => c.id === prev) ? prev : categories[0].id,
    );
  }, [categories]);

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    setCatError('');
    setAddingCat(true);
    // TODO: POST /api/restaurants/[restaurantId]/menu/categories
    await new Promise((r) => setTimeout(r, 300));
    setCategories((prev) => [
      ...prev,
      {
        id: `cat-${Date.now()}`,
        name: newCatName,
        sortOrder: prev.length,
        isVisible: true,
        items: [],
      },
    ]);
    setNewCatName('');
    setAddingCat(false);
  }

  async function toggleAvailable(categoryId: string, itemId: string, current: boolean) {
    // TODO: PATCH /api/restaurants/[restaurantId]/menu/items/[itemId]
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id === categoryId
          ? {
              ...cat,
              items: cat.items.map((item) =>
                item.id === itemId ? { ...item, isAvailable: !current } : item
              ),
            }
          : cat
      )
    );
  }

  async function handlePhotoUpload(file: File) {
    setUploadingPhoto(true);
    // TODO: get signed upload URL from /api/restaurant/menu/upload-url
    //       then PUT file to the signed URL, store resulting R2 public URL
    await new Promise((r) => setTimeout(r, 600));
    const mockUrl = URL.createObjectURL(file);
    setPendingImageUrl(mockUrl);
    setUploadingPhoto(false);
  }

  function openAddItem(categoryId: string) {
    setAddItemCategoryId(categoryId);
    setItemForm({ ...EMPTY_ITEM, categoryId });
    setPendingImageUrl(null);
    setItemError('');
    setShowAddItem(true);
  }

  async function handleSaveItem(e: React.FormEvent) {
    e.preventDefault();
    setItemError('');

    const priceNum = parseFloat(itemForm.price);
    if (isNaN(priceNum) || priceNum <= 0) {
      setItemError('Price must be a positive number.');
      return;
    }

    setSavingItem(true);
    // TODO: POST /api/restaurants/[restaurantId]/menu/items
    await new Promise((r) => setTimeout(r, 400));

    const newItem: MenuItemRow = {
      id: `item-${Date.now()}`,
      name: itemForm.name,
      description: itemForm.description || null,
      price: priceNum.toFixed(2),
      imageUrl: pendingImageUrl,
      allergens: itemForm.allergens,
      isAvailable: true,
      isPopular: itemForm.isPopular,
      sortOrder: 0,
      categoryId: addItemCategoryId,
    };

    setCategories((prev) =>
      prev.map((cat) =>
        cat.id === addItemCategoryId
          ? { ...cat, items: [...cat.items, newItem] }
          : cat
      )
    );

    setSavingItem(false);
    setShowAddItem(false);
    setPendingImageUrl(null);
  }

  return (
    <PageShell>
      <PageHead
        title={
          <>
            The <em>menu</em>
          </>
        }
        subtitle={<>Categories, items, photos, prices. 86 anything in one tap.</>}
        actions={
          <button
            type="button"
            disabled={!activeMenuCat}
            onClick={() => activeMenuCat && openAddItem(activeMenuCat)}
            className="rounded-full bg-primary px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-primary-foreground transition-colors hover:bg-amber-light disabled:opacity-40"
          >
            + New item
          </button>
        }
      />

      <form onSubmit={handleAddCategory} className="t-add">
        <input
          type="text"
          required
          maxLength={80}
          placeholder="Table number or name (e.g. 1 or Bar)"
          value={newCatName}
          onChange={(e) => setNewCatName(e.target.value)}
          className="min-h-[48px] flex-1 rounded-[10px] border border-border bg-scrim-2 px-4 py-2 font-body text-[17px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={addingCat}
          className="rounded-full bg-invert px-5 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-invert-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {addingCat ? 'Adding...' : 'Add category'}
        </button>
      </form>
      {catError && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {catError}
        </p>
      )}

      {loading ? (
        <p className="py-10 text-center font-body text-muted-foreground">Loading menu...</p>
      ) : categories.length === 0 ? (
        <p className="py-10 text-center font-body text-muted-foreground">
          No categories yet. Add one above to start building your menu.
        </p>
      ) : (
        <div className="menu-cols">
          <div className="menu-cats">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={activeMenuCat === cat.id ? 'on' : ''}
                onClick={() => setActiveMenuCat(cat.id)}
              >
                <span>{cat.name}</span>
                <span className="ct">{cat.items.length}</span>
              </button>
            ))}
          </div>
          <div className="menu-items">
            {(() => {
              const cat = categories.find((c) => c.id === activeMenuCat);
              if (!cat) {
                return <p className="font-body text-muted-foreground">Select a category.</p>;
              }
              if (cat.items.length === 0) {
                return (
                  <p className="py-6 text-center font-body text-sm text-muted-foreground">
                    No items in this category yet.
                  </p>
                );
              }
              return cat.items.map((item) => (
                <div key={item.id} className="menu-row">
                  <div
                    className="ph bg-scrim-2"
                    style={
                      item.imageUrl
                        ? { backgroundImage: `url(${item.imageUrl})`, backgroundSize: 'cover' }
                        : undefined
                    }
                  />
                  <div className="min-w-0">
                    <div className="nm flex flex-wrap items-center gap-2">
                      {item.name}
                      {item.isPopular ? (
                        <span className="rounded-full border border-amber-soft-line bg-amber-soft px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
                          Featured
                        </span>
                      ) : null}
                    </div>
                    {item.description ? <div className="dsc">{item.description}</div> : null}
                    {item.allergens.length > 0 ? (
                      <div className="dsc">{item.allergens.join(', ')}</div>
                    ) : null}
                  </div>
                  <div className="pr">{item.price}</div>
                  <button
                    type="button"
                    aria-label={item.isAvailable ? '86 item' : 'Restore item'}
                    onClick={() => toggleAvailable(cat.id, item.id, item.isAvailable)}
                    className={`toggle ${item.isAvailable ? 'on' : ''}`}
                  />
                  <span className="mono w-12 text-center text-[9px] text-muted-foreground">
                    {item.isAvailable ? 'On' : '86'}
                  </span>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* Add item modal */}
      {showAddItem && (
        <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close"
            onClick={() => setShowAddItem(false)}
          />
          <div className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-[14px] border border-border bg-card p-6 shadow-xl sm:max-w-lg sm:rounded-[14px]">
            <h2 className="mb-4 font-display text-2xl font-light text-foreground">Add menu item</h2>

            <form onSubmit={handleSaveItem} className="space-y-4">
              <div>
                <label className="mb-1 block font-mono text-[9px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
                  Photo
                </label>
                <div
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  className="flex h-28 w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border transition-colors hover:border-primary"
                >
                  {pendingImageUrl ? (
                    <img src={pendingImageUrl} alt="preview" className="h-full w-full object-cover" />
                  ) : uploadingPhoto ? (
                    <p className="text-xs text-muted-foreground">Uploading...</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Click to upload photo</p>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePhotoUpload(file);
                  }}
                />
              </div>

              <div>
                <label className="mb-1 block font-mono text-[9px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
                  Item name
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={itemForm.name}
                  onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-[10px] border border-border bg-scrim-2 px-4 py-3 font-body text-[17px] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="mb-1 block font-mono text-[9px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
                  Description <span className="font-normal normal-case text-muted-foreground/80">(optional)</span>
                </label>
                <textarea
                  maxLength={400}
                  rows={2}
                  value={itemForm.description}
                  onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full resize-none rounded-[10px] border border-border bg-scrim-2 px-4 py-3 font-body text-[17px] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="mb-1 block font-mono text-[9px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
                  Price ($)
                </label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0.01"
                  placeholder="14.00"
                  value={itemForm.price}
                  onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))}
                  className="w-full rounded-[10px] border border-border bg-scrim-2 px-4 py-3 font-body text-[17px] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="mb-2 block font-mono text-[9px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
                  Allergens
                </label>
                <div className="flex flex-wrap gap-2">
                  {ALLERGEN_OPTIONS.map((allergen) => {
                    const selected = itemForm.allergens.includes(allergen);
                    return (
                      <button
                        key={allergen}
                        type="button"
                        onClick={() =>
                          setItemForm((f) => ({
                            ...f,
                            allergens: selected
                              ? f.allergens.filter((a) => a !== allergen)
                              : [...f.allergens, allergen],
                          }))
                        }
                        className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider transition-colors ${
                          selected
                            ? 'border-amber-soft-line bg-amber-soft text-primary'
                            : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'
                        }`}
                      >
                        {allergen}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={itemForm.isPopular}
                  onChange={(e) => setItemForm((f) => ({ ...f, isPopular: e.target.checked }))}
                  className="rounded border-border"
                />
                <span className="font-body text-sm text-foreground">
                  Mark as featured (shows in the Featured row on the diner&apos;s tab)
                </span>
              </label>

              {itemError && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {itemError}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddItem(false)}
                  className="flex-1 rounded-xl border border-border py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-foreground transition-colors hover:bg-scrim-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingItem || uploadingPhoto}
                  className="flex-1 rounded-xl bg-primary py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-primary-foreground transition-colors hover:bg-amber-light disabled:opacity-50"
                >
                  {savingItem ? 'Saving...' : 'Add item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}
