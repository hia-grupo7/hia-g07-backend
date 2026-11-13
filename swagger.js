const swaggerAutogen = require('swagger-autogen')();

const doc = {
  info: {
    title: 'API de Rayuela Marketplace',
    description: 'Documentación de la API para el marketplace literario Rayuela.'
  },
  host: 'localhost:3000', 
  basePath: "/",
  schemes: ['http'],
  tags: [
    {
      name: 'Usuarios y Empleados',
      description: 'Operaciones de administración, empleados y auditoría (Integrante 4).'
    },
    {
      name: 'Libros',
      description: 'Operaciones para sincronizar y consultar el catálogo de libros.'
    }
    // Aqui tienen que ir agregando sus tags (Libros, Carrito, etc.)
  ],
  definitions: {
    Usuario: {
      apellido: 'Orrabaliz',
      nombre: 'Lucas',
      email: 'lucas@rayuela.com',
      passordHash: 'contrasenia123',
      rol: 'empleado',
      estado: true
    },
    RespuestaSincronizacion: {
      procesadosAPI: 80,
      insertadosDB: 80
    },
    CambioRol:{
      rol: 'admin'
    }
  }
};

const outputFile = './swagger_output.json';
const endpointsFiles = ['./app.js']; 

swaggerAutogen(outputFile, endpointsFiles, doc).then(() => {
  console.log(`Documentación generada con éxito en ${outputFile}`);
});