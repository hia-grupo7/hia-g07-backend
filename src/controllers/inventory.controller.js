const inventoryService = require('../services/inventory.service');

const inventoryController = {};

inventoryController.generateInventoryForAllBooks = async (req, res) => {
    try {
        const result = await inventoryService.generateInventoryForAllBooks();
        res.json(result);
    } catch (error) {
        console.error('Error al generar inventarios:', error.message);
        res.status(500).json({ error: 'Error al generar inventarios' });
    }
};

inventoryController.getInventory = async (req, res) => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 15;
        const filters = {
            name: req.query.name,
            title: req.query.title,
            category: req.query.category,
            language: req.query.language,
            publicationDate: req.query.publicationDate,
            from: req.query.from,
            to: req.query.to
        };
        const inventory = await inventoryService.getInventory({ page, limit, filters });
        res.json(inventory);
    } catch (error) {
        console.error('Error al obtener el inventario:', error.message);
        res.status(500).json({ error: 'Error al obtener el inventario' });
    }
};

inventoryController.createInventory = async (req, res) => {
    try {
        const inventoryData = req.body;
        const newInventory = await inventoryService.createInventory(inventoryData);
        res.status(201).json(newInventory);
    } catch (error) {
        console.error('Error al crear el inventario:', error.message);
        res.status(500).json({ error: 'Error al crear el inventario' });
    }
};

inventoryController.updateInventory = async (req, res) => {
    try {
        const { id } = req.params;
        const inventoryData = req.body;
        const updatedInventory = await inventoryService.updateInventory(id, inventoryData);
        res.json(updatedInventory);
    } catch (error) {
        console.error('Error al actualizar el inventario:', error.message);
        res.status(500).json({ error: 'Error al actualizar el inventario' });
    }
};

inventoryController.deleteInventory = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedInventory = await inventoryService.deleteInventory(id);
        res.json(deletedInventory);
    } catch (error) {
        console.error('Error al borrar el inventario:', error.message);
        res.status(500).json({ error: 'Error al borrar el inventario' });
    }
};

inventoryController.getInventoryById = async (req, res) => {
    try {
        const { id } = req.params;
        const inventory = await inventoryService.getInventoryById(id);
        res.json(inventory);
    } catch (error) {
        console.error('Error al obtener el inventario por ID:', error.message);
        res.status(500).json({ error: 'Error al obtener el inventario por ID' });
    }
};

module.exports = inventoryController;

