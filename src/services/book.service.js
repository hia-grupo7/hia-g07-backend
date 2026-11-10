const axios = require('axios');
const bookMapper = require('../utils/bookMapper');
const Book = require('../models/book.model');

const SEARCH_CATEGORIES = ['history', 'science', 'fiction', 'biography', 'technology', 'philosophy', 'mystery', 'romance', 'suspense', 'crime', 'psychology'];
const BOOKS_PER_CATEGORY = 3;

const bookService = {};

async function fetchAuthorNames(authors = []) {
    const authorKeys = (authors || [])
        .map((author) => author?.key)
        .filter(Boolean);

    const names = [];

    for (const authorKey of authorKeys) {
        try {
            const authorResponse = await axios.get(`https://openlibrary.org${authorKey}.json`, { timeout: 8000 });
            if (authorResponse?.data?.name) {
                names.push(authorResponse.data.name);
            }
        } catch (error) {
            console.warn(`No se pudo obtener el autor ${authorKey}: ${error.message}`);
        }
    }

    return names;
}

bookService.fillInitialCatalog = async () => {
    try {
        const mappedBooks = [];
        const seenIsbns = new Set();

        for (const category of SEARCH_CATEGORIES) {
            const url = `https://openlibrary.org/search.json?q=subject:${category}&limit=${BOOKS_PER_CATEGORY}&fields=key,title,author_name,isbn,cover_i,subject,publish_date,language`;
            const response = await axios.get(url, { timeout: 15000 });
            const books = response.data.docs || [];

            for (const doc of books) {
                const isbn = Array.isArray(doc.isbn) ? doc.isbn[0] : null;
                if (!isbn || seenIsbns.has(isbn)) continue;

                const mappedBook = bookMapper.mapOpenLibraryBookToBook({
                    title: doc.title,
                    authors: (doc.author_name || []).map((name) => ({ name })),
                    publish_date: Array.isArray(doc.publish_date) ? doc.publish_date[0] : doc.publish_date,
                    description: null,
                    covers: doc.cover_i ? [doc.cover_i] : [],
                    identifiers: { isbn_13: [isbn] },
                    subjects: Array.isArray(doc.subject) ? doc.subject.slice(0, 3) : [],
                    language: Array.isArray(doc.language) ? doc.language[0] : doc.language,
                    ratings_average: null,
                    publisher: null,
                    cover_id: doc.cover_i,
                    category,
                    subject: [category]
                }, isbn, []);

                mappedBooks.push(mappedBook);
                seenIsbns.add(isbn);
            }
        }

        const dedupedBooks = mappedBooks.filter((book, index, books) =>
            books.findIndex((candidate) => candidate.isbn === book.isbn) === index
        );

        if (dedupedBooks.length === 0) {
            throw new Error('No se encontraron libros para sincronizar.');
        }

        const existingBooks = await Book.findAll({ where: { isbn: dedupedBooks.map((book) => book.isbn) } });
        const existingIsbns = new Set(existingBooks.map((book) => book.isbn));
        const booksToCreate = dedupedBooks.filter((book) => !existingIsbns.has(book.isbn));

        if (booksToCreate.length === 0) {
            return {
                procesadosAPI: dedupedBooks.length,
                insertadosDB: 0,
                mensaje: 'Todos los libros ya estaban cargados en la base de datos.'
            };
        }

        const result = await Book.bulkCreate(booksToCreate, { ignoreDuplicates: true });

        return {
            procesadosAPI: dedupedBooks.length,
            insertadosDB: result.length,
            libros: result
        };
    } catch (error) {
        console.error('No se pudo obtener libros desde Open Library:', error.message);
        throw new Error(`No se pudo sincronizar el catálogo: ${error.message}`);
    }
};

bookService.getBooks = async () => {
    try {
        const books = await Book.findAll();
        return books;
    } catch (error) {
        throw new Error(`Error al obtener los libros: ${error.message}`);
    }
};

bookService.createBook = async (bookData) => {
    try {
        const existingBook = await Book.findOne({ where: { isbn: bookData.isbn } });
        if (existingBook) {
            throw new Error('El libro con este ISBN ya existe en la base de datos.');
        }
        const newBook = await Book.create(bookData);
        return newBook;
    } catch (error) {
        throw new Error(`Error al crear el libro: ${error.message}`);
    }
};

bookService.updateBook = async (id, bookData) => {
    try {
        const existingBook = await Book.findByPk(id);
        if (!existingBook) {
            throw new Error('El libro no existe en la base de datos.');
        }
        await existingBook.update(bookData);
        return existingBook;
    } catch (error) {
        throw new Error(`Error al actualizar el libro: ${error.message}`);
    }
};

bookService.deleteBook = async (id) => {
    try {
        const existingBook = await Book.findByPk(id);
        if (!existingBook) {
            throw new Error('El libro no existe en la base de datos.');
        }
        await existingBook.destroy();
        return existingBook;
    } catch (error) {
        throw new Error(`Error al borrar el libro: ${error.message}`);
    }
};

bookService.getBookById = async (id) =>{
    try{
        const Book = await Book.findByPk(id)
        if(!Book){
            throw new Error('El libro no existe en la base de datos.');
        }
        return Book;
    }catch(error){
        throw new Error(`Error al borrar el libro: ${error.message}`);
    }
};

module.exports = bookService;