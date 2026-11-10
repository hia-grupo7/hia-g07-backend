const { Op, fn, col } = require('sequelize');
const Auditoria = require('../models/auditoria.model');
const Usuario = require('../models/usuario.model');


const auditoriaService = {};

auditoriaService.obtenerAuditoriasPaginadas = async (page, limit, search, fecha) => {
    const offset = (page - 1) * limit;
    
    let whereClause = {};
    let whereUsuarioClause = {};

    // 1. Si el admin busca por nombre/apellido del usuario
    if (search) {
        whereUsuarioClause[Op.or] = [
            { nombre: { [Op.iLike]: `%${search}%` } },
            { apellido: { [Op.iLike]: `%${search}%` } }
        ];
    }

    // 2. Si el admin filtra por un día específico (YYYY-MM-DD)
    if (fecha) {
        whereClause.fecha = {
            [Op.and]: [
                { [Op.gte]: new Date(`${fecha}T00:00:00.000Z`) },
                { [Op.lte]: new Date(`${fecha}T23:59:59.999Z`) }
            ]
        };
    }

    // Hacemos la consulta principal
    const { count, rows } = await Auditoria.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        order: [['fecha', 'DESC']],
        include: [
            {
                model: Usuario,
                as: 'usuario',
                attributes: ['id', 'nombre', 'apellido'],
                
                where: search ? whereUsuarioClause : null,
                required: search ? true : false
            }
        ]
    });

    return {
        totalItems: count,
        auditorias: rows,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page, 10)
    };
};

module.exports = auditoriaService;