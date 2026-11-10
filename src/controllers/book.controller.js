const bookService = require('../services/book.service');

const bookController = {};

bookController.fillInitialCatalog = async (req, res) => {
    try {
        const resuls = await bookService.fillInitialCatalog();
        res.json(resuls);
    } catch (error) {
        console.error('Error al obtener el catálogo inicial:', error.message);
        res.status(502).json({
            error: 'No se pudo sincronizar el catálogo',
            detalle: error.message
        });
    }
};

bookController.getBooks = async (req, res) => {
    try {
        const books = await bookService.getBooks();
        res.json(books);
    } catch (error) {
        console.error('Error al obtener los libros:', error.message);
        res.status(500).json({
            error: 'Error al obtener los libros',
            detalle: error.message
        });
    }
};

bookController.postBook = async (req, res) => {
    try {
        const nuevoLibro = req.body;
        const libroCreado = await bookService.createBook(nuevoLibro);
        res.status(201).json(libroCreado);
    } catch (error) {
        console.error('Error al crear el libro:', error.message);
        res.status(500).json({
            error: 'Error al crear el libro',
            detalle: error.message
        });
    }
};

bookController.putBook = async (req, res) => {
    try {
        const { id } = req.params;
        const bookUpdated = req.body;
        const book = await bookService.updateBook(id, bookUpdated);
        res.json(book);
    } catch (error) {
        console.error('Error al actualizar el libro:', error.message);
        res.status(500).json({
            error: 'Error al actualizar el libro',
            detalle: error.message
        });
    }
};

bookController.deleteBook = async (req, res) => {
    try {
        const { id } = req.params;
        const book = await bookService.deleteBook(id);
        res.json(book);
    } catch (error) {
        console.error('Error al borrar el libro:', error.message);
        res.status(500).json({
            error: 'Error al borrar el libro',
            detalle: error.message
        });
    }
};

bookController.getBookById = async (req, res) => {
    try{
        const { id } = req.params;
        const book = await bookService.getBookById(id);
        res.json(book);
    } catch(error){
        console.error('Error al buscar el libro:', error.message);
    }
}

module.exports = bookController;