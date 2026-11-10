function normalizeText(value, fallback = 'Sin información') {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : fallback;
  }

  return fallback;
}

function normalizeOptionalText(value, fallback = null) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : fallback;
  }

  return fallback;
}

function normalizeDate(value) {
  if (!value) return null;

  if (typeof value === 'string') {
    const match = value.match(/(\d{4})/);
    if (match) {
      const year = match[1];
      const month = value.match(/(January|February|March|April|May|June|July|August|September|October|November|December)/i);
      const monthIndex = month ? new Date(`${month[0]} 1, ${year}`).getMonth() + 1 : 1;
      const dayMatch = value.match(/(\d{1,2})/);
      const day = dayMatch ? Number(dayMatch[1]) : 1;
      return `${year}-${String(monthIndex).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString().split('T')[0];
}

function normalizeRating(value) {
  if (value === null || value === undefined || value === '') {
    return Number((Math.random() * 5).toFixed(1));
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return Number((Math.random() * 5).toFixed(1));
  }

  if (parsed < 0) return 0;
  if (parsed > 5) return 5;
  return Number(parsed.toFixed(1));
}

function normalizeLanguage(value) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/languages/')) {
    return trimmed.replace('/languages/', '');
  }

  return trimmed;
}

function extractIsbn(openLibraryBook, fallbackIsbn = null) {
  const identifiers = openLibraryBook?.identifiers || {};
  const isbn13 = identifiers.isbn_13?.[0] || identifiers.isbn_13 || null;
  const isbn10 = identifiers.isbn_10?.[0] || identifiers.isbn_10 || null;

  return normalizeText(isbn13 || isbn10 || fallbackIsbn || 'Sin ISBN', 'Sin ISBN');
}

function extractDescription(description) {
  if (typeof description === 'string') {
    return normalizeText(description, 'Sin descripción');
  }

  if (description && typeof description === 'object' && typeof description.value === 'string') {
    return normalizeText(description.value, 'Sin descripción');
  }

  return 'Sin descripción';
}

function extractAuthors(authors) {
  if (Array.isArray(authors) && authors.length > 0) {
    const names = authors
      .map((author) => author?.name || author?.author?.name || null)
      .filter(Boolean);

    return normalizeText(names.join(', '), 'Sin autor');
  }

  return 'Sin autor';
}

function extractCover(coverId) {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : 'Sin portada';
}

function extractCategory(subjects) {
  if (Array.isArray(subjects) && subjects.length > 0) {
    const firstSubject = subjects.find((item) => typeof item === 'string' && item.trim());
    if (typeof firstSubject === 'string') {
      return normalizeText(firstSubject, 'Sin categoría');
    }

    const objectSubject = subjects.find((item) => item?.name);
    if (objectSubject?.name) {
      return normalizeText(objectSubject.name, 'Sin categoría');
    }
  }

  return 'Sin categoría';
}

function mapOpenLibraryBookToBook(openLibraryBook, fallbackIsbn = null, fallbackAuthors = []) {
  if (!openLibraryBook || typeof openLibraryBook !== 'object') {
    throw new Error('El libro recibido no es válido');
  }

  const authors = Array.isArray(fallbackAuthors) && fallbackAuthors.length > 0
    ? fallbackAuthors.join(', ')
    : extractAuthors(openLibraryBook.authors);

  return {
    isbn: extractIsbn(openLibraryBook, fallbackIsbn),
    title: normalizeText(openLibraryBook.title, 'Sin título'),
    author: normalizeText(authors, 'Sin autor'),
    description: extractDescription(openLibraryBook.description),
    category: normalizeText(openLibraryBook.category || extractCategory(openLibraryBook.subjects || openLibraryBook.subject || []), 'Sin categoría'),
    bookCover: extractCover(openLibraryBook.covers?.[0] || openLibraryBook.cover_id),
    score: normalizeRating(openLibraryBook.ratings_average),
    editorial: normalizeOptionalText(openLibraryBook.publisher, 'Sin editorial'),
    language: normalizeLanguage(openLibraryBook.languages?.[0]?.key || openLibraryBook.language),
    publicationDate: normalizeDate(openLibraryBook.publish_date)
  };
}

module.exports = {
  mapOpenLibraryBookToBook
};
