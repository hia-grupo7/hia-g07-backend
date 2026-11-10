const chatService = require('../services/chat.service');

const chatController = {};

chatController.hacerPregunta = async (req, res) => {
    try {
        const { pregunta, tituloLibro, autorLibro } = req.body;

        if (!pregunta || !tituloLibro) {
            return res.status(400).json({ error: 'Faltan datos obligatorios' });
        }

        const respuestaIA = await chatService.consultarLibro(pregunta, tituloLibro, autorLibro);
        
        res.status(200).json({ respuesta: respuestaIA });
    } catch (error) {
        console.error('Error en el chat:', error);
        res.status(500).json({ error: 'El asistente no está disponible en este momento.' });
    }
};

module.exports = chatController;