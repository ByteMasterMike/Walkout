'use client';

import { useEffect, useRef, useState } from 'react';

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

  async function loadMenu() {
    // TODO: fetch from /api/restaurants/[restaurantId]/menu once Michael ships it
    setCategories([]);
    setLoading(false);
  }

  useEffect(() => { loadMenu(); }, []);

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
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Menu</h1>
      <p className="text-sm text-gray-500 mb-8">
        Manage categories and items. Tap the toggle to 86 an item from the menu instantly.
      </p>

      {/* Add category */}
      <form onSubmit={handleAddCategory} className="flex gap-3 mb-8">
        <input
          type="text"
          required
          maxLength={80}
          placeholder="New category name (e.g. Starters)"
          value={newCatName}
          onChange={(e) => setNewCatName(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
        />
        <button
          type="submit"
          disabled={addingCat}
          className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {addingCat ? 'Adding...' : 'Add category'}
        </button>
      </form>
      {catError && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {catError}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-10">Loading menu...</p>
      ) : categories.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">
          No categories yet. Add one above to start building your menu.
        </p>
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => (
            <div key={cat.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900">{cat.name}</p>
                <button
                  onClick={() => openAddItem(cat.id)}
                  className="text-xs px-3 py-1.5 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Add item
                </button>
              </div>

              {cat.items.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">
                  No items yet. Add one to this category.
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {cat.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                      {/* Photo thumbnail */}
                      <div className="w-12 h-12 rounded-lg bg-gray-100 shrink-0 overflow-hidden">
                        {item.imageUrl && (
                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                        )}
                      </div>

                      {/* Item info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                          {item.isPopular && (
                            <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">
                              Featured
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">${item.price}</p>
                        {item.allergens.length > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {item.allergens.join(', ')}
                          </p>
                        )}
                      </div>

                      {/* 86 toggle */}
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <button
                          onClick={() => toggleAvailable(cat.id, item.id, item.isAvailable)}
                          className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
                            item.isAvailable ? 'bg-gray-900' : 'bg-gray-200'
                          }`}
                          aria-label={item.isAvailable ? '86 item' : 'Restore item'}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                              item.isAvailable ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                        <span className="text-xs text-gray-400">
                          {item.isAvailable ? 'Available' : '86\'d'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add item modal */}
      {showAddItem && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowAddItem(false)}
          />
          <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-bold text-gray-900 mb-4">Add menu item</h2>

            <form onSubmit={handleSaveItem} className="space-y-4">
              {/* Photo upload */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Photo</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-28 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors overflow-hidden"
                >
                  {pendingImageUrl ? (
                    <img src={pendingImageUrl} alt="preview" className="w-full h-full object-cover" />
                  ) : uploadingPhoto ? (
                    <p className="text-xs text-gray-400">Uploading...</p>
                  ) : (
                    <p className="text-xs text-gray-400">Click to upload photo</p>
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
                <label className="block text-xs font-medium text-gray-700 mb-1">Item name</label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={itemForm.name}
                  onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Description <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  maxLength={400}
                  rows={2}
                  value={itemForm.description}
                  onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Price ($)</label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0.01"
                  placeholder="14.00"
                  value={itemForm.price}
                  onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Allergens</label>
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
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          selected
                            ? 'bg-amber-50 text-amber-700 border-amber-300'
                            : 'text-gray-500 border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        {allergen}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={itemForm.isPopular}
                  onChange={(e) => setItemForm((f) => ({ ...f, isPopular: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">
                  Mark as featured (shows in the Featured row on the diner&apos;s tab)
                </span>
              </label>

              {itemError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {itemError}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddItem(false)}
                  className="flex-1 py-2.5 border border-gray-300 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingItem || uploadingPhoto}
                  className="flex-1 py-2.5 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  {savingItem ? 'Saving...' : 'Add item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
