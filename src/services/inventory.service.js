const { Op } = require('sequelize');
const Inventory = require('../models/inventory.model');
const Book = require('../models/book.model');

const inventoryService = {};

function normalizeBookReference(inventoryData) {
    const normalized = { ...inventoryData };

    if (!normalized.bookId && inventoryData?.book?.id) {
        normalized.bookId = inventoryData.book.id;
    }

    if (!normalized.bookId && inventoryData?.bookId) {
        normalized.bookId = inventoryData.bookId;
    }

    return normalized;
}

function generateRandomDate() {
    const start = new Date(2010, 0, 1);
    const end = new Date();
    const randomDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    return randomDate.toISOString().split('T')[0];
}

function buildInventoryPayload(book) {
    const hasStock = Math.random() > 0.2;
    const stock = hasStock ? Math.floor(Math.random() * 20) + 1 : 0;
    const reserved = stock > 0 ? Math.floor(Math.random() * Math.min(stock, 5)) : 0;
    const price = Number((Math.random() * 200 + 10).toFixed(2));

    return {
        bookId: book.id,
        entryDate: generateRandomDate(),
        stock,
        price,
        reserved
    };
}

function normalizeFilterValue(value) {
    if (typeof value !== 'string') {
        return undefined;
    }

    const normalizedValue = value.trim();
    return normalizedValue ? normalizedValue : undefined;
}

function buildPublicationDateFilter(filters = {}) {
    const from = normalizeFilterValue(filters.from);
    const to = normalizeFilterValue(filters.to);
    const preset = normalizeFilterValue(filters.publicationDate);

    if (from && to) {
        return { [Op.between]: [from, to] };
    }

    if (from) {
        return { [Op.gte]: from };
    }

    if (to) {
        return { [Op.lte]: to };
    }

    if (!preset) {
        return undefined;
    }

    const today = new Date();

    switch (preset) {
        case 'last5years': {
            const lastFiveYears = new Date(today.getFullYear() - 5, today.getMonth(), today.getDate());
            return { [Op.gte]: lastFiveYears.toISOString().split('T')[0] };
        }
        case 'lastYear': {
            const lastYear = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
            return { [Op.gte]: lastYear.toISOString().split('T')[0] };
        }
        case 'before2020':
            return { [Op.lt]: '2020-01-01' };
        default:
            return undefined;
    }
}

inventoryService.buildBookFilters = function buildBookFilters(filters = {}) {
    const bookWhere = {};
    const name = normalizeFilterValue(filters.name ?? filters.title);
    const category = normalizeFilterValue(filters.category);
    const language = normalizeFilterValue(filters.language);
    const publicationDateFilter = buildPublicationDateFilter(filters);

    if (name) {
        bookWhere.title = { [Op.iLike]: `%${name}%` };
    }

    if (category) {
        bookWhere.category = { [Op.iLike]: category };
    }

    if (language) {
        bookWhere.language = { [Op.iLike]: language };
    }

    if (publicationDateFilter) {
        bookWhere.publicationDate = publicationDateFilter;
    }

    return bookWhere;
};

inventoryService.generateInventoryForAllBooks = async () => {
    try {
        const books = await Book.findAll();

        if (!books.length) {
            return {
                created: 0,
                message: 'No hay libros para generar inventarios.'
            };
        }

        const existingInventory = await Inventory.findAll({ attributes: ['bookId'] });
        const existingBookIds = new Set(existingInventory.map((entry) => entry.bookId));

        const inventoryToCreate = books
            .filter((book) => !existingBookIds.has(book.id))
            .map((book) => buildInventoryPayload(book));

        if (!inventoryToCreate.length) {
            return {
                created: 0,
                message: 'Ya existen inventarios para todos los libros.'
            };
        }

        const createdInventory = await Inventory.bulkCreate(inventoryToCreate);

        return {
            created: createdInventory.length,
            inventory: createdInventory
        };
    } catch (error) {
        throw new Error(`Error al generar inventarios: ${error.message}`);
    }
};

inventoryService.getInventory = async ({ page = 1, limit = 15, filters = {} } = {}) => {
    try {
        const normalizedPage = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
        const normalizedLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 15;
        const offset = (normalizedPage - 1) * normalizedLimit;
        const bookFilters = inventoryService.buildBookFilters(filters);

        const include = Object.keys(bookFilters).length
            ? [{ model: Book, as: 'book', where: bookFilters }]
            : [{ model: Book, as: 'book' }];

        const { count, rows } = await Inventory.findAndCountAll({
            include,
            limit: normalizedLimit,
            offset,
            order: [['id', 'ASC']]
        });

        const totalPages = Math.ceil(count / normalizedLimit);

        return {
            items: rows,
            totalItems: count,
            totalPages,
            currentPage: normalizedPage,
            hasNextPage: normalizedPage < totalPages
        };
    } catch (error) {
        throw new Error('Error al obtener el inventario');
    }
};

inventoryService.createInventory = async (inventoryData) => {
    try {
        const normalizedData = normalizeBookReference(inventoryData);

        if (!normalizedData.bookId) {
            throw new Error('Se requiere un libro para crear el inventario.');
        }

        const existingBook = await Book.findByPk(normalizedData.bookId);
        if (!existingBook) {
            throw new Error('El libro indicado no existe.');
        }

        const newInventory = await Inventory.create(normalizedData);
        return newInventory;
    } catch (error) {
        throw new Error(`Error al crear el inventario: ${error.message}`);
    }
};

inventoryService.updateInventory = async (id, inventoryData) => {
    try {
        const normalizedData = normalizeBookReference(inventoryData);

        const existentInventory = await Inventory.findByPk(id);
        if (!existentInventory) {
            throw new Error('Inventario no encontrado');
        }

        if (normalizedData.bookId) {
            const existingBook = await Book.findByPk(normalizedData.bookId);
            if (!existingBook) {
                throw new Error('El libro indicado no existe.');
            }
        }

        await existentInventory.update(normalizedData);
        return existentInventory;
    } catch (error) {
        throw new Error(`Error al actualizar el inventario: ${error.message}`);
    }
};

inventoryService.deleteInventory = async (id) => {
    try {
        const existentInventory = await Inventory.findByPk(id);
        if (!existentInventory) {
            throw new Error('Inventario no encontrado');
        }
        await existentInventory.destroy();
        return existentInventory;
    } catch (error) {
        throw new Error('Error al borrar el inventario');
    }
};

inventoryService.getInventoryById = async (id) => {
    try {
        const inventory = await Inventory.findByPk(id, {
            include: [{ model: Book, as: 'book' }]
        });
        if (!inventory) {
            throw new Error('Inventario no encontrado');
        }
        return inventory;
    } catch (error) {
        throw new Error('Error al obtener el inventario por ID');
    }
};

module.exports = inventoryService;
