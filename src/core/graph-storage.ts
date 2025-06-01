import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import type { KnowledgeGraph } from '../types/index.js';

/**
 * Handles storage and retrieval of knowledge graphs
 */
export class GraphStorage {
  private graphsDirectory: string;

  constructor(basePath: string = './data/graphs') {
    this.graphsDirectory = basePath;
    this.ensureDirectoryExists();
  }

  /**
   * Ensures the graphs directory exists
   */
  private ensureDirectoryExists(): void {
    try {
      if (!fs.existsSync(this.graphsDirectory)) {
        fs.mkdirSync(this.graphsDirectory, { recursive: true });
        logger.info(`Created graphs directory: ${this.graphsDirectory}`);
      }
    } catch (error) {
      logger.error(`Failed to create graphs directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Saves a knowledge graph to storage
   */
  async saveGraph(graph: KnowledgeGraph): Promise<string> {
    try {
      const graphId = uuidv4();
      const graphFilePath = path.join(this.graphsDirectory, `${graphId}.json`);
      
      await fs.promises.writeFile(
        graphFilePath,
        JSON.stringify(graph, null, 2)
      );
      
      logger.info(`Saved graph to ${graphFilePath}`);
      return graphId;
    } catch (error) {
      logger.error(`Failed to save graph: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Retrieves a knowledge graph from storage
   */
  async getGraph(graphId: string): Promise<KnowledgeGraph | null> {
    try {
      const graphFilePath = path.join(this.graphsDirectory, `${graphId}.json`);
      
      if (!fs.existsSync(graphFilePath)) {
        logger.warn(`Graph not found: ${graphId}`);
        return null;
      }
      
      const graphData = await fs.promises.readFile(graphFilePath, 'utf-8');
      return JSON.parse(graphData) as KnowledgeGraph;
    } catch (error) {
      logger.error(`Failed to retrieve graph ${graphId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  /**
   * Deletes a knowledge graph from storage
   */
  async deleteGraph(graphId: string): Promise<boolean> {
    try {
      const graphFilePath = path.join(this.graphsDirectory, `${graphId}.json`);
      
      if (!fs.existsSync(graphFilePath)) {
        logger.warn(`Cannot delete graph, not found: ${graphId}`);
        return false;
      }
      
      await fs.promises.unlink(graphFilePath);
      logger.info(`Deleted graph: ${graphId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete graph ${graphId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Lists all available knowledge graphs
   */
  async listGraphs(): Promise<{ id: string; metadata: any }[]> {
    try {
      const files = await fs.promises.readdir(this.graphsDirectory);
      const graphFiles = files.filter(file => file.endsWith('.json'));
      
      const graphs = await Promise.all(
        graphFiles.map(async (file) => {
          const graphId = path.basename(file, '.json');
          const graphFilePath = path.join(this.graphsDirectory, file);
          
          try {
            const graphData = await fs.promises.readFile(graphFilePath, 'utf-8');
            const graph = JSON.parse(graphData) as KnowledgeGraph;
            return {
              id: graphId,
              metadata: graph.metadata,
            };
          } catch (error) {
            logger.warn(`Failed to read graph ${graphId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return {
              id: graphId,
              metadata: { error: 'Failed to read graph metadata' },
            };
          }
        })
      );
      
      return graphs;
    } catch (error) {
      logger.error(`Failed to list graphs: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }
}