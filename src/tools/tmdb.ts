import type { ToolSet } from "ai";
import { env } from "#/utils/env";
import { tool } from "ai";
import { z } from "zod";

async function tmdbRequest(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  if (!env.TMDB_API_KEY) {
    throw new Error("TMDB_API_KEY is not configured");
  }

  const queryParams = new URLSearchParams({
    api_key: env.TMDB_API_KEY,
    language: "fr-FR",
    ...params,
  });

  const response = await fetch(`https://api.themoviedb.org/3/${endpoint}?${queryParams.toString()}`);

  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export const tmdbTools: ToolSet = {
  searchMovie: tool({
    description: "Recherche un film sur TMDB par son titre",
    inputSchema: z.object({
      query: z.string().describe("Le titre du film à rechercher"),
      year: z.number().optional().describe("Année de sortie optionnelle pour affiner la recherche"),
    }),
    outputSchema: z.object({
      results: z.array(z.object({
        id: z.number().describe("ID TMDB du film"),
        title: z.string().describe("Titre du film"),
        originalTitle: z.string().describe("Titre original du film"),
        releaseDate: z.string().describe("Date de sortie"),
        overview: z.string().describe("Synopsis du film"),
        voteAverage: z.number().describe("Note moyenne (0-10)"),
        voteCount: z.number().describe("Nombre de votes"),
        posterUrl: z.string().nullable().describe("URL du poster"),
        backdropUrl: z.string().nullable().describe("URL de l'image de fond"),
        popularity: z.number().describe("Score de popularité"),
      })).describe("Liste des films trouvés"),
      totalResults: z.number().describe("Nombre total de résultats"),
    }),
    execute: async ({ query, year }) => {
      const params: Record<string, string> = { query };
      if (year) params.year = year.toString();

      const data = await tmdbRequest("search/movie", params);

      const results = data.results.slice(0, 5).map((movie: any) => ({
        id: movie.id,
        title: movie.title,
        originalTitle: movie.original_title,
        releaseDate: movie.release_date || "Date inconnue",
        overview: movie.overview || "Pas de synopsis disponible",
        voteAverage: movie.vote_average || 0,
        voteCount: movie.vote_count || 0,
        posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
        backdropUrl: movie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : null,
        popularity: movie.popularity || 0,
      }));

      return {
        results,
        totalResults: data.total_results,
      };
    },
  }),

  searchTVShow: tool({
    description: "Recherche une série TV sur TMDB par son titre",
    inputSchema: z.object({
      query: z.string().describe("Le titre de la série à rechercher"),
      year: z.number().optional().describe("Année de première diffusion optionnelle"),
    }),
    outputSchema: z.object({
      results: z.array(z.object({
        id: z.number().describe("ID TMDB de la série"),
        name: z.string().describe("Nom de la série"),
        originalName: z.string().describe("Nom original de la série"),
        firstAirDate: z.string().describe("Date de première diffusion"),
        overview: z.string().describe("Synopsis de la série"),
        voteAverage: z.number().describe("Note moyenne (0-10)"),
        voteCount: z.number().describe("Nombre de votes"),
        posterUrl: z.string().nullable().describe("URL du poster"),
        backdropUrl: z.string().nullable().describe("URL de l'image de fond"),
        popularity: z.number().describe("Score de popularité"),
      })).describe("Liste des séries trouvées"),
      totalResults: z.number().describe("Nombre total de résultats"),
    }),
    execute: async ({ query, year }) => {
      const params: Record<string, string> = { query };
      if (year) params.first_air_date_year = year.toString();

      const data = await tmdbRequest("search/tv", params);

      const results = data.results.slice(0, 5).map((show: any) => ({
        id: show.id,
        name: show.name,
        originalName: show.original_name,
        firstAirDate: show.first_air_date || "Date inconnue",
        overview: show.overview || "Pas de synopsis disponible",
        voteAverage: show.vote_average || 0,
        voteCount: show.vote_count || 0,
        posterUrl: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : null,
        backdropUrl: show.backdrop_path ? `https://image.tmdb.org/t/p/w1280${show.backdrop_path}` : null,
        popularity: show.popularity || 0,
      }));

      return {
        results,
        totalResults: data.total_results,
      };
    },
  }),

  getMovieDetails: tool({
    description: "Obtient les détails complets d'un film spécifique par son ID TMDB",
    inputSchema: z.object({
      movieId: z.number().describe("L'ID TMDB du film"),
    }),
    outputSchema: z.object({
      id: z.number().describe("ID TMDB du film"),
      title: z.string().describe("Titre du film"),
      originalTitle: z.string().describe("Titre original"),
      tagline: z.string().nullable().describe("Slogan du film"),
      overview: z.string().describe("Synopsis"),
      releaseDate: z.string().describe("Date de sortie"),
      runtime: z.number().nullable().describe("Durée en minutes"),
      voteAverage: z.number().describe("Note moyenne (0-10)"),
      voteCount: z.number().describe("Nombre de votes"),
      budget: z.number().describe("Budget en dollars"),
      revenue: z.number().describe("Revenus en dollars"),
      genres: z.string().describe("Genres séparés par des virgules"),
      productionCompanies: z.string().describe("Sociétés de production"),
      posterUrl: z.string().nullable().describe("URL du poster"),
      backdropUrl: z.string().nullable().describe("URL de l'image de fond"),
      homepage: z.string().nullable().describe("Site officiel"),
      imdbId: z.string().nullable().describe("ID IMDb"),
      status: z.string().describe("Statut de sortie"),
      originalLanguage: z.string().describe("Langue originale"),
    }),
    execute: async ({ movieId }) => {
      const movie = await tmdbRequest(`movie/${movieId}`);

      return {
        id: movie.id,
        title: movie.title,
        originalTitle: movie.original_title,
        tagline: movie.tagline || null,
        overview: movie.overview || "Pas de synopsis disponible",
        releaseDate: movie.release_date || "Date inconnue",
        runtime: movie.runtime || null,
        voteAverage: movie.vote_average || 0,
        voteCount: movie.vote_count || 0,
        budget: movie.budget || 0,
        revenue: movie.revenue || 0,
        genres: movie.genres?.map((g: any) => g.name).join(", ") || "Inconnu",
        productionCompanies: movie.production_companies?.map((c: any) => c.name).join(", ") || "Inconnu",
        posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
        backdropUrl: movie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : null,
        homepage: movie.homepage || null,
        imdbId: movie.imdb_id || null,
        status: movie.status || "Inconnu",
        originalLanguage: movie.original_language || "Inconnu",
      };
    },
  }),

  getTVShowDetails: tool({
    description: "Obtient les détails complets d'une série TV spécifique par son ID TMDB",
    inputSchema: z.object({
      tvId: z.number().describe("L'ID TMDB de la série"),
    }),
    outputSchema: z.object({
      id: z.number().describe("ID TMDB de la série"),
      name: z.string().describe("Nom de la série"),
      originalName: z.string().describe("Nom original"),
      tagline: z.string().nullable().describe("Slogan de la série"),
      overview: z.string().describe("Synopsis"),
      firstAirDate: z.string().describe("Date de première diffusion"),
      lastAirDate: z.string().describe("Date de dernière diffusion"),
      numberOfSeasons: z.number().describe("Nombre de saisons"),
      numberOfEpisodes: z.number().describe("Nombre d'épisodes"),
      episodeRunTime: z.string().describe("Durée moyenne des épisodes"),
      voteAverage: z.number().describe("Note moyenne (0-10)"),
      voteCount: z.number().describe("Nombre de votes"),
      genres: z.string().describe("Genres séparés par des virgules"),
      networks: z.string().describe("Chaînes de diffusion"),
      productionCompanies: z.string().describe("Sociétés de production"),
      posterUrl: z.string().nullable().describe("URL du poster"),
      backdropUrl: z.string().nullable().describe("URL de l'image de fond"),
      homepage: z.string().nullable().describe("Site officiel"),
      status: z.string().describe("Statut de la série"),
      type: z.string().describe("Type de série"),
      inProduction: z.boolean().describe("En production"),
    }),
    execute: async ({ tvId }) => {
      const show = await tmdbRequest(`tv/${tvId}`);

      return {
        id: show.id,
        name: show.name,
        originalName: show.original_name,
        tagline: show.tagline || null,
        overview: show.overview || "Pas de synopsis disponible",
        firstAirDate: show.first_air_date || "Date inconnue",
        lastAirDate: show.last_air_date || "Date inconnue",
        numberOfSeasons: show.number_of_seasons || 0,
        numberOfEpisodes: show.number_of_episodes || 0,
        episodeRunTime: `${show.episode_run_time?.join(", ")} min` || "Inconnu",
        voteAverage: show.vote_average || 0,
        voteCount: show.vote_count || 0,
        genres: show.genres?.map((g: any) => g.name).join(", ") || "Inconnu",
        networks: show.networks?.map((n: any) => n.name).join(", ") || "Inconnu",
        productionCompanies: show.production_companies?.map((c: any) => c.name).join(", ") || "Inconnu",
        posterUrl: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : null,
        backdropUrl: show.backdrop_path ? `https://image.tmdb.org/t/p/w1280${show.backdrop_path}` : null,
        homepage: show.homepage || null,
        status: show.status || "Inconnu",
        type: show.type || "Inconnu",
        inProduction: show.in_production || false,
      };
    },
  }),

  getMovieCredits: tool({
    description: "Obtient les crédits (acteurs, réalisateurs) d'un film",
    inputSchema: z.object({
      movieId: z.number().describe("L'ID TMDB du film"),
    }),
    outputSchema: z.object({
      cast: z.array(z.object({
        name: z.string().describe("Nom de l'acteur"),
        character: z.string().describe("Personnage joué"),
        profileUrl: z.string().nullable().describe("URL de la photo de profil"),
      })).describe("Distribution (max 10 acteurs principaux)"),
      crew: z.array(z.object({
        name: z.string().describe("Nom du membre de l'équipe"),
        job: z.string().describe("Poste"),
        department: z.string().describe("Département"),
      })).describe("Équipe technique (réalisateurs, producteurs, etc.)"),
    }),
    execute: async ({ movieId }) => {
      const credits = await tmdbRequest(`movie/${movieId}/credits`);

      const cast = credits.cast.slice(0, 10).map((person: any) => ({
        name: person.name,
        character: person.character || "Inconnu",
        profileUrl: person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null,
      }));

      const crew = credits.crew
        .filter((person: any) => ["Director", "Producer", "Writer", "Screenplay"].includes(person.job))
        .map((person: any) => ({
          name: person.name,
          job: person.job,
          department: person.department,
        }));

      return { cast, crew };
    },
  }),

  getTrendingMovies: tool({
    description: "Obtient les films tendance du moment",
    inputSchema: z.object({
      timeWindow: z.enum(["day", "week"]).optional().describe("Période de tendance (day ou week, défaut: week)"),
    }),
    outputSchema: z.object({
      results: z.array(z.object({
        id: z.number().describe("ID TMDB du film"),
        title: z.string().describe("Titre du film"),
        releaseDate: z.string().describe("Date de sortie"),
        overview: z.string().describe("Synopsis"),
        voteAverage: z.number().describe("Note moyenne (0-10)"),
        posterUrl: z.string().nullable().describe("URL du poster"),
      })).describe("Liste des films tendance (max 10)"),
    }),
    execute: async ({ timeWindow = "week" }) => {
      const data = await tmdbRequest(`trending/movie/${timeWindow}`);

      const results = data.results.slice(0, 10).map((movie: any) => ({
        id: movie.id,
        title: movie.title,
        releaseDate: movie.release_date || "Date inconnue",
        overview: movie.overview || "Pas de synopsis disponible",
        voteAverage: movie.vote_average || 0,
        posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
      }));

      return { results };
    },
  }),
};
