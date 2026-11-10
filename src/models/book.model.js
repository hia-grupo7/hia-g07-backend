const {DataTypes} = require('sequelize');
const  sequelize = require('../../config/database');

const Libro = sequelize.define('Libro', {
    id: {type: DataTypes.INTEGER,primaryKey: true,autoIncrement: true},
    isbn: {type: DataTypes.STRING,allowNull: false},
    title: {type: DataTypes.STRING,allowNull: false},
    author: {type: DataTypes.STRING,allowNull: false},
    description: {type: DataTypes.STRING,allowNull: false},
    category: {type: DataTypes.STRING,allowNull: false},
    bookCover: {type: DataTypes.STRING,allowNull: false},
    score: {type: DataTypes.FLOAT, allowNull: true, defaultValue: null},
    editorial: {type: DataTypes.STRING, allowNull: true, defaultValue: null},
    language: {type: DataTypes.STRING, allowNull: true, defaultValue: null},
    publicationDate: {type: DataTypes.DATEONLY, allowNull: true, defaultValue: null}
},{
    tableName: 'libros',
    timestamps: false
}
);

module.exports = Libro;