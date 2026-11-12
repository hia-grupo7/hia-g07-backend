require('dotenv').config();
const sequelize = require('./config/database');
const Libro = require('./src/models/book.model');
const Inventory = require('./src/models/inventory.model');

const libros = [
  {
    isbn: '978-9500704403',
    title: 'Rayuela',
    author: 'Julio Cortázar',
    description: 'Una novela experimental que puede leerse de múltiples maneras, siguiendo al protagonista Horacio Oliveira en París y Buenos Aires.',
    category: 'FICTION',
    bookCover: 'https://covers.openlibrary.org/b/id/1047466-M.jpg',
    score: 4.8,
    editorial: 'Sudamericana',
    language: 'SPA',
    publicationDate: '1963-06-28',
  },
  {
    isbn: '978-9870006411',
    title: 'El Aleph',
    author: 'Jorge Luis Borges',
    description: 'Colección de cuentos magistrales que exploran el infinito, el tiempo y la identidad a través de metáforas literarias únicas.',
    category: 'FICTION',
    bookCover: 'https://covers.openlibrary.org/b/id/14408958-M.jpg',
    score: 4.9,
    editorial: 'Emecé',
    language: 'SPA',
    publicationDate: '1949-01-01',
  },
  {
    isbn: '978-9500420860',
    title: 'Cien años de soledad',
    author: 'Gabriel García Márquez',
    description: 'La saga de la familia Buendía en el mítico pueblo de Macondo, obra cumbre del realismo mágico latinoamericano.',
    category: 'FICTION',
    bookCover: 'https://covers.openlibrary.org/b/id/12627383-M.jpg',
    score: 4.9,
    editorial: 'Sudamericana',
    language: 'SPA',
    publicationDate: '1967-05-30',
  },
  {
    isbn: '978-8408115755',
    title: 'El nombre de la rosa',
    author: 'Umberto Eco',
    description: 'Un monje medieval investiga una serie de misteriosas muertes en un monasterio benedictino en la Italia del siglo XIV.',
    category: 'MYSTERY',
    bookCover: 'https://covers.openlibrary.org/b/id/8598263-M.jpg',
    score: 4.7,
    editorial: 'Lumen',
    language: 'SPA',
    publicationDate: '1980-01-01',
  },
  {
    isbn: '978-9878000374',
    title: 'Harry Potter y la piedra filosofal',
    author: 'J.K. Rowling',
    description: 'Un niño huérfano descubre que es un mago y es admitido en el colegio Hogwarts, donde aprenderá magia y enfrentará al mago oscuro Voldemort.',
    category: 'FANTASY',
    bookCover: 'https://covers.openlibrary.org/b/id/15155833-M.jpg',
    score: 4.8,
    editorial: 'Salamandra',
    language: 'SPA',
    publicationDate: '1997-06-26',
  },
  {
    isbn: '978-9500426855',
    title: 'El túnel',
    author: 'Ernesto Sabato',
    description: 'La novela narra la obsesión de un pintor por una mujer que lo lleva hasta un trágico final, obra fundamental de la literatura argentina.',
    category: 'FICTION',
    bookCover: 'https://covers.openlibrary.org/b/id/5517733-M.jpg',
    score: 4.5,
    editorial: 'Seix Barral',
    language: 'SPA',
    publicationDate: '1948-01-01',
  },
  {
    isbn: '978-8491052043',
    title: 'Sapiens: De animales a dioses',
    author: 'Yuval Noah Harari',
    description: 'Un recorrido por la historia de la humanidad desde los primeros humanos hasta la era moderna, explorando cómo nuestra especie conquistó el mundo.',
    category: 'HISTORY',
    bookCover: 'https://covers.openlibrary.org/b/id/8634250-M.jpg',
    score: 4.7,
    editorial: 'Debate',
    language: 'SPA',
    publicationDate: '2011-01-01',
  },
  {
    isbn: '978-9500735834',
    title: 'Ficciones',
    author: 'Jorge Luis Borges',
    description: 'Colección de relatos donde Borges construye laberintos literarios, bibliotecas infinitas y mundos paralelos con una prosa impecable.',
    category: 'FICTION',
    bookCover: 'https://covers.openlibrary.org/b/id/10832290-M.jpg',
    score: 4.9,
    editorial: 'Emecé',
    language: 'SPA',
    publicationDate: '1944-01-01',
  },
  {
    isbn: '978-6075275284',
    title: 'El principito',
    author: 'Antoine de Saint-Exupéry',
    description: 'Un cuento filosófico y poético que narra el encuentro de un aviador con un pequeño príncipe que viaja entre planetas.',
    category: 'FICTION',
    bookCover: 'https://covers.openlibrary.org/b/id/10708272-M.jpg',
    score: 4.8,
    editorial: 'Salamandra',
    language: 'SPA',
    publicationDate: '1943-04-06',
  },
  {
    isbn: '978-9500436908',
    title: '1984',
    author: 'George Orwell',
    description: 'En un futuro totalitario, Winston Smith trabaja para el Ministerio de la Verdad reescribiendo la historia según los dictados del Gran Hermano.',
    category: 'FICTION',
    bookCover: 'https://covers.openlibrary.org/b/id/9267242-M.jpg',
    score: 4.8,
    editorial: 'Destino',
    language: 'SPA',
    publicationDate: '1949-06-08',
  },
  {
    isbn: '978-9500730600',
    title: 'Don Quijote de la Mancha',
    author: 'Miguel de Cervantes',
    description: 'El caballero andante más famoso de la literatura universal emprende aventuras épicas acompañado de su fiel escudero Sancho Panza.',
    category: 'FICTION',
    bookCover: 'https://covers.openlibrary.org/b/id/14428305-M.jpg',
    score: 4.6,
    editorial: 'Losada',
    language: 'SPA',
    publicationDate: '1605-01-16',
  },
  {
    isbn: '978-9500730310',
    title: 'Orgullo y prejuicio',
    author: 'Jane Austen',
    description: 'La historia de Elizabeth Bennet y el señor Darcy en la Inglaterra del siglo XIX, una crítica social envuelta en una historia de amor.',
    category: 'ROMANCE',
    bookCover: 'https://covers.openlibrary.org/b/id/14348537-M.jpg',
    score: 4.7,
    editorial: 'Alba',
    language: 'SPA',
    publicationDate: '1813-01-28',
  },
];

async function seed() {
  try {
    await sequelize.sync({ force: false });
    console.log('✔ Conexión a la base de datos establecida.');

    // Eliminar el libro de auditoría de prueba si existe
    await Libro.destroy({ where: { isbn: 'AUDIT001' } });

    let creados = 0;
    const librosCreados = [];

    for (const libro of libros) {
      const [instance, wasCreated] = await Libro.findOrCreate({
        where: { isbn: libro.isbn },
        defaults: libro,
      });
      librosCreados.push(instance);
      if (wasCreated) creados++;
    }

    console.log(`✔ Libros procesados: ${librosCreados.length} (${creados} nuevos, ${librosCreados.length - creados} ya existían).`);

    // Crear inventario para cada libro si no tiene
    let inventariosCreados = 0;
    for (const libro of librosCreados) {
      const existing = await Inventory.findOne({ where: { bookId: libro.id } });
      if (!existing) {
        await Inventory.create({
          bookId: libro.id,
          entryDate: new Date().toISOString().split('T')[0],
          stock: Math.floor(Math.random() * 20) + 5,
          price: parseFloat((Math.random() * 2000 + 500).toFixed(2)),
          reserved: 0,
        });
        inventariosCreados++;
      }
    }

    console.log(`✔ Inventarios creados: ${inventariosCreados}`);
    console.log('✅ Seed completado con éxito.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en el seed:', err.message);
    process.exit(1);
  }
}

seed();
