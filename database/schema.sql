--
-- PostgreSQL database dump
--

\restrict nEuOCwyHjiTcjZCPDvDd6yYFbioIsU8Q5Z77kCPwXFIg7MdsmlYLXcClz0hek03

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auditorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auditorias (
    id integer NOT NULL,
    accion character varying(255) NOT NULL,
    "tablaAfectada" character varying(255) NOT NULL,
    "registroId" integer,
    "usuarioId" integer,
    detalle text NOT NULL,
    fecha timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: auditorias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auditorias_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auditorias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auditorias_id_seq OWNED BY public.auditorias.id;


--
-- Name: cupones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cupones (
    id integer NOT NULL,
    codigo character varying(255) NOT NULL,
    "porcentajeDescuento" double precision NOT NULL,
    "fechaVencimiento" timestamp with time zone NOT NULL,
    "usosMaximos" integer DEFAULT 1 NOT NULL,
    "usosActuales" integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: cupones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cupones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cupones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cupones_id_seq OWNED BY public.cupones.id;


--
-- Name: inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory (
    id integer NOT NULL,
    "entryDate" date NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    price double precision DEFAULT '0'::double precision NOT NULL,
    reserved integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "bookId" integer
);


--
-- Name: inventory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventory_id_seq OWNED BY public.inventory.id;


--
-- Name: libros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.libros (
    id integer NOT NULL,
    isbn character varying(255) NOT NULL,
    title character varying(255) NOT NULL,
    author character varying(255) NOT NULL,
    description character varying(255) NOT NULL,
    category character varying(255) NOT NULL,
    "bookCover" character varying(255) NOT NULL,
    score double precision,
    editorial character varying(255) DEFAULT NULL::character varying,
    language character varying(255) DEFAULT NULL::character varying,
    "publicationDate" date
);


--
-- Name: libros_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.libros_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: libros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.libros_id_seq OWNED BY public.libros.id;


--
-- Name: reservas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservas (
    id integer NOT NULL,
    "idUsuario" integer NOT NULL,
    "fechaReserva" timestamp with time zone,
    "fechaVencimiento" timestamp with time zone NOT NULL,
    estado character varying(255) DEFAULT 'activa'::character varying,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "idLibro" integer
);


--
-- Name: reservas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reservas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reservas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reservas_id_seq OWNED BY public.reservas.id;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id integer NOT NULL,
    nombre character varying(255) NOT NULL,
    descripcion character varying(255)
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: test_card02_persistencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_card02_persistencia (
    id integer NOT NULL,
    responsable text DEFAULT 'Bruno - DBA Lead'::text,
    fecha timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: test_card02_persistencia_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.test_card02_persistencia_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: test_card02_persistencia_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.test_card02_persistencia_id_seq OWNED BY public.test_card02_persistencia.id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    nombre character varying(255) NOT NULL,
    apellido character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    "passwordHash" character varying(255),
    estado boolean DEFAULT true NOT NULL,
    "googleId" character varying(255),
    "otpCode" character varying(255),
    "otpExpiresAt" timestamp with time zone,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "rolId" integer
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- Name: venta_detalles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venta_detalles (
    id integer NOT NULL,
    cantidad integer DEFAULT 1 NOT NULL,
    "precioUnitario" double precision NOT NULL,
    "idVenta" integer,
    "idLibro" integer
);


--
-- Name: venta_detalles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.venta_detalles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: venta_detalles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.venta_detalles_id_seq OWNED BY public.venta_detalles.id;


--
-- Name: ventas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ventas (
    id integer NOT NULL,
    "idUsuario" integer NOT NULL,
    "idCupon" integer,
    total double precision DEFAULT '0'::double precision NOT NULL,
    estado character varying(255) DEFAULT 'pendiente'::character varying,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: ventas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ventas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ventas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ventas_id_seq OWNED BY public.ventas.id;


--
-- Name: auditorias id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditorias ALTER COLUMN id SET DEFAULT nextval('public.auditorias_id_seq'::regclass);


--
-- Name: cupones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupones ALTER COLUMN id SET DEFAULT nextval('public.cupones_id_seq'::regclass);


--
-- Name: inventory id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory ALTER COLUMN id SET DEFAULT nextval('public.inventory_id_seq'::regclass);


--
-- Name: libros id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.libros ALTER COLUMN id SET DEFAULT nextval('public.libros_id_seq'::regclass);


--
-- Name: reservas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas ALTER COLUMN id SET DEFAULT nextval('public.reservas_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: test_card02_persistencia id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_card02_persistencia ALTER COLUMN id SET DEFAULT nextval('public.test_card02_persistencia_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- Name: venta_detalles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta_detalles ALTER COLUMN id SET DEFAULT nextval('public.venta_detalles_id_seq'::regclass);


--
-- Name: ventas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas ALTER COLUMN id SET DEFAULT nextval('public.ventas_id_seq'::regclass);


--
-- Name: auditorias auditorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditorias
    ADD CONSTRAINT auditorias_pkey PRIMARY KEY (id);


--
-- Name: cupones cupones_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupones
    ADD CONSTRAINT cupones_codigo_key UNIQUE (codigo);


--
-- Name: cupones cupones_codigo_key1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupones
    ADD CONSTRAINT cupones_codigo_key1 UNIQUE (codigo);


--
-- Name: cupones cupones_codigo_key2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupones
    ADD CONSTRAINT cupones_codigo_key2 UNIQUE (codigo);


--
-- Name: cupones cupones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupones
    ADD CONSTRAINT cupones_pkey PRIMARY KEY (id);


--
-- Name: inventory inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_pkey PRIMARY KEY (id);


--
-- Name: libros libros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.libros
    ADD CONSTRAINT libros_pkey PRIMARY KEY (id);


--
-- Name: reservas reservas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_pkey PRIMARY KEY (id);


--
-- Name: roles roles_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_nombre_key UNIQUE (nombre);


--
-- Name: roles roles_nombre_key1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_nombre_key1 UNIQUE (nombre);


--
-- Name: roles roles_nombre_key2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_nombre_key2 UNIQUE (nombre);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: test_card02_persistencia test_card02_persistencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_card02_persistencia
    ADD CONSTRAINT test_card02_persistencia_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_email_key1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key1 UNIQUE (email);


--
-- Name: usuarios usuarios_email_key2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key2 UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: venta_detalles venta_detalles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta_detalles
    ADD CONSTRAINT venta_detalles_pkey PRIMARY KEY (id);


--
-- Name: ventas ventas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas
    ADD CONSTRAINT ventas_pkey PRIMARY KEY (id);


--
-- Name: auditorias auditorias_usuarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditorias
    ADD CONSTRAINT "auditorias_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: inventory inventory_bookId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT "inventory_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES public.libros(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: reservas reservas_idLibro_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT "reservas_idLibro_fkey" FOREIGN KEY ("idLibro") REFERENCES public.libros(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: reservas reservas_idUsuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT "reservas_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES public.usuarios(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: usuarios usuarios_rolId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT "usuarios_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: venta_detalles venta_detalles_idLibro_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta_detalles
    ADD CONSTRAINT "venta_detalles_idLibro_fkey" FOREIGN KEY ("idLibro") REFERENCES public.libros(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: venta_detalles venta_detalles_idVenta_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venta_detalles
    ADD CONSTRAINT "venta_detalles_idVenta_fkey" FOREIGN KEY ("idVenta") REFERENCES public.ventas(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ventas ventas_idCupon_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas
    ADD CONSTRAINT "ventas_idCupon_fkey" FOREIGN KEY ("idCupon") REFERENCES public.cupones(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ventas ventas_idUsuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas
    ADD CONSTRAINT "ventas_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES public.usuarios(id) ON UPDATE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict nEuOCwyHjiTcjZCPDvDd6yYFbioIsU8Q5Z77kCPwXFIg7MdsmlYLXcClz0hek03

