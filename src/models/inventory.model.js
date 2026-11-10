const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const Book = require('./book.model');

const Inventory = sequelize.define('Inventory', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    entryDate: { type: DataTypes.DATEONLY, allowNull: false },
    stock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    price: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    reserved: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, {
    tableName: 'inventory',
    timestamps: true,
});

Inventory.belongsTo(Book, { foreignKey: 'bookId', as: 'book' });

module.exports = Inventory;