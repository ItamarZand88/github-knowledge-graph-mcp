/**
 * LLM Integration Service for intelligent code search and understanding
 * Provides natural language interface to the knowledge graph
 */

import { EnhancedNodeIndex, type SearchResult, type LLMGraphContext } from "./enhanced-node-index.js";
import { logger } from "../utils/logger.js";
import type { GraphNode } from "../types/index.js";

export interface LLMSearchRequest {
  naturalLanguageQuery: string;
  context?: {
    currentFile?: string;
    recentNodes?: string[];
    intent?: 'understand' | 'modify' | 'debug' | 'extend';
  };
}

export interface LLMSearchResponse {
  interpretation: {
    intent: string;
    extractedConcepts: string[];
    suggestedSearches: Array<{
      type: 'pattern' | 'advanced' | 'direct';
      query: any;
      explanation: string;
    }>;
  };
  results: Array<{
    node: GraphNode;
    relevanceScore: number;
    explanation: string;
  }>;
  followUpQuestions: string[];
  suggestedActions: string[];
}

export interface ExecutionFlowResult {
  trigger: string;
  steps: Array<{
    node: GraphNode;
    stepType: 'entry' | 'call' | 'data_transform' | 'decision' | 'exit';
    description: string;
    dataState?: any;
    conditions?: string[];
  }>;
  branches: Array<{
    condition: string;
    steps: GraphNode[];
    probability: 'high' | 'medium' | 'low';
  }>;
  dataFlow: Array<{
    from: string;
    to: string;
    transformation: string;
    node: GraphNode;
  }>;
  summary: string;
  potentialIssues: string[];
}

export interface DependencyAnalysisResult {
  nodeInfo: GraphNode;
  incoming: Array<{
    id: string;
    name: string;
    type: string;
    relationship: string;
    distance: number;
  }>;
  outgoing: Array<{
    id: string;
    name: string;
    type: string;
    relationship: string;
    distance: number;
  }>;
  directDependencies: number;
  transitiveDependencies: number;
  impactAssessment: {
    riskLevel: 'low' | 'medium' | 'high';
    affectedComponents: number;
    criticalPath: boolean;
  };
}

export class LLMIntegrationService {
  private nodeIndex: EnhancedNodeIndex;

  constructor(nodeIndex: EnhancedNodeIndex) {
    this.nodeIndex = nodeIndex;
  }

  /**
   * 🔥 Build complete context for LLM
   */
  buildLLMContext(): LLMGraphContext {
    return this.nodeIndex.buildLLMContext();
  }

  /**
   * 🔥 Translate natural language query to technical searches
   */
  async interpretNaturalLanguageQuery(request: LLMSearchRequest): Promise<LLMSearchResponse> {
    const query = request.naturalLanguageQuery.toLowerCase();
    const results: Array<{node: GraphNode; relevanceScore: number; explanation: string}> = [];
    
    logger.info(`Processing natural language query: "${request.naturalLanguageQuery}"`);
    
    // Extract concepts from query
    const concepts = this.extractConcepts(query);
    
    // Generate search strategies
    const searchStrategies = this.generateSearchStrategies(concepts, query);
    
    // Execute searches
    for (const strategy of searchStrategies) {
      const searchResults = this.executeSearch(strategy);
      results.push(...searchResults);
    }

    // Deduplicate and rank
    const uniqueResults = this.deduplicateAndRank(results);

    return {
      interpretation: {
        intent: this.detectIntent(query),
        extractedConcepts: concepts,
        suggestedSearches: searchStrategies
      },
      results: uniqueResults.slice(0, 10),
      followUpQuestions: this.generateFollowUpQuestions(concepts, uniqueResults),
      suggestedActions: this.generateSuggestedActions(concepts, uniqueResults)
    };
  }

  /**
   * 🔥 Trace execution flow with intelligent analysis
   */
  async traceExecutionFlow(
    startPoint: string,
    endPoint?: string,
    options: {
      maxDepth?: number;
      includeBranches?: boolean;
      focusArea?: string;
    } = {}
  ): Promise<ExecutionFlowResult> {
    const { maxDepth = 5, includeBranches = true, focusArea } = options;
    
    logger.info(`Tracing execution flow from "${startPoint}" to "${endPoint || 'end'}"`);

    // Find starting node
    const startResults = this.nodeIndex.findNodes(startPoint, { maxResults: 1 });
    if (startResults.length === 0) {
      throw new Error(`Starting point not found: ${startPoint}`);
    }

    const startNode = startResults[0].node;
    
    // Build execution path using graph traversal
    const rawPath = await this.buildExecutionPath(startNode, endPoint, maxDepth);
    
    // Create flow result
    const flowResult: ExecutionFlowResult = {
      trigger: startNode.name,
      steps: rawPath.map(node => ({
        node,
        stepType: this.inferStepType(node),
        description: this.generateStepDescription(node),
        dataState: this.inferDataState(node),
        conditions: this.inferConditions(node)
      })),
      branches: [],
      dataFlow: [],
      summary: this.generateFlowSummary(rawPath, startPoint),
      potentialIssues: this.identifyPotentialIssues(rawPath)
    };

    // Add branches if requested
    if (includeBranches) {
      flowResult.branches = await this.discoverExecutionBranches(rawPath);
    }

    // Add data flow analysis
    flowResult.dataFlow = await this.traceDataTransformations(rawPath);

    return flowResult;
  }

  /**
   * 🔥 Analyze dependencies with impact assessment
   */
  async analyzeDependencies(
    targetNode: string,
    direction: 'incoming' | 'outgoing' | 'both' = 'both'
  ): Promise<DependencyAnalysisResult> {
    logger.info(`Analyzing dependencies for "${targetNode}"`);

    // Find target node
    const nodeResults = this.nodeIndex.findNodes(targetNode, { maxResults: 1 });
    if (nodeResults.length === 0) {
      throw new Error(`Target node not found: ${targetNode}`);
    }

    const node = nodeResults[0].node;

    // Get dependencies using indexed edges
    const incomingConnections = direction === 'both' || direction === 'incoming'
      ? this.nodeIndex.getDependentNodes(node.id)
      : [];

    const outgoingConnections = direction === 'both' || direction === 'outgoing'
      ? this.nodeIndex.getConnectedNodes(node.id)
      : [];

    // Build dependency info
    const incoming = incomingConnections.map(conn => ({
      id: conn.node.id,
      name: conn.node.name,
      type: conn.node.type,
      relationship: conn.edge.type,
      distance: conn.distance
    }));

    const outgoing = outgoingConnections.map(conn => ({
      id: conn.node.id,
      name: conn.node.name,
      type: conn.node.type,
      relationship: conn.edge.type,
      distance: conn.distance
    }));

    // Assess impact
    const totalConnections = incoming.length + outgoing.length;
    const riskLevel = totalConnections > 10 ? 'high' : totalConnections > 5 ? 'medium' : 'low';

    return {
      nodeInfo: node,
      incoming,
      outgoing,
      directDependencies: totalConnections,
      transitiveDependencies: 0, // TODO: implement transitive analysis
      impactAssessment: {
        riskLevel,
        affectedComponents: totalConnections,
        criticalPath: this.isCriticalPath(node, totalConnections)
      }
    };
  }

  /**
   * 🔥 Explore graph area around a component
   */
  async exploreGraphArea(
    startingNode: string,
    options: {
      depth?: number;
      focusDomain?: string;
      relationshipTypes?: string[];
      excludeTypes?: string[];
    } = {}
  ): Promise<{
    coreComponents: GraphNode[];
    relatedComponents: GraphNode[];
    architectureInsights: string[];
    suggestedExploration: string[];
  }> {
    const { depth = 2, focusDomain, relationshipTypes, excludeTypes } = options;

    logger.info(`Exploring graph area around "${startingNode}"`);

    // Find starting node
    const startResults = this.nodeIndex.findNodes(startingNode, { maxResults: 1 });
    if (startResults.length === 0) {
      throw new Error(`Starting node not found: ${startingNode}`);
    }

    const startNode = startResults[0].node;
    const explored = new Set<string>([startNode.id]);
    const coreComponents = [startNode];
    const relatedComponents: GraphNode[] = [];

    // BFS exploration
    let currentLevel = [startNode];
    for (let level = 0; level < depth; level++) {
      const nextLevel: GraphNode[] = [];

      for (const currentNode of currentLevel) {
        const connections = this.nodeIndex.getAllConnectedNodes(
          currentNode.id,
          relationshipTypes
        );

        for (const connection of connections) {
          if (explored.has(connection.node.id)) continue;
          if (excludeTypes?.includes(connection.node.type)) continue;

          explored.add(connection.node.id);
          
          if (level === 0) {
            coreComponents.push(connection.node);
          } else {
            relatedComponents.push(connection.node);
          }
          
          nextLevel.push(connection.node);
        }
      }

      currentLevel = nextLevel;
    }

    return {
      coreComponents,
      relatedComponents,
      architectureInsights: this.generateArchitectureInsights(coreComponents, relatedComponents),
      suggestedExploration: this.generateExplorationSuggestions(coreComponents, relatedComponents)
    };
  }

  // ================================================================================
  // PRIVATE HELPER METHODS
  // ================================================================================

  /**
   * Extract concepts from natural language query
   */
  private extractConcepts(query: string): string[] {
    const concepts: string[] = [];
    
    // Technical terms
    const techTerms = [
      'api', 'endpoint', 'service', 'controller', 'model', 'view', 'component',
      'data', 'process', 'validate', 'transform', 'business', 'logic',
      'error', 'handle', 'manage', 'create', 'update', 'delete', 'get',
      'interface', 'class', 'function', 'method', 'variable'
    ];
    
    for (const term of techTerms) {
      if (query.includes(term)) {
        concepts.push(term);
      }
    }

    // Action words
    const actions = ['how', 'what', 'where', 'why', 'show', 'find', 'trace', 'analyze'];
    for (const action of actions) {
      if (query.includes(action)) {
        concepts.push(action);
      }
    }

    return [...new Set(concepts)];
  }

  /**
   * Generate search strategies based on concepts
   */
  private generateSearchStrategies(concepts: string[], query: string): Array<{
    type: 'pattern' | 'advanced' | 'direct';
    query: any;
    explanation: string;
  }> {
    const strategies: Array<{type: 'pattern' | 'advanced' | 'direct'; query: any; explanation: string}> = [];

    // Pattern-based searches
    if (concepts.includes('api')) {
      strategies.push({
        type: 'pattern',
        query: 'function.*.api_*',
        explanation: 'Searching for all API-related functions'
      });
    }

    if (concepts.includes('data')) {
      strategies.push({
        type: 'pattern', 
        query: '*.*data*',
        explanation: 'Searching for all data-related components'
      });
    }

    if (concepts.includes('business')) {
      strategies.push({
        type: 'pattern',
        query: '*.*business*',
        explanation: 'Searching for all business logic components'
      });
    }

    // Advanced searches
    if (concepts.includes('process')) {
      strategies.push({
        type: 'advanced',
        query: { nameContains: 'process' },
        explanation: 'Searching for all processing functions'
      });
    }

    if (concepts.includes('validate')) {
      strategies.push({
        type: 'advanced',
        query: { nameContains: 'validate' },
        explanation: 'Searching for all validation functions'
      });
    }

    return strategies;
  }

  /**
   * Execute search strategy
   */
  private executeSearch(strategy: {type: string; query: any; explanation: string}): Array<{
    node: GraphNode;
    relevanceScore: number;
    explanation: string;
  }> {
    let nodes: GraphNode[] = [];

    if (strategy.type === 'pattern') {
      nodes = this.nodeIndex.searchByPattern(strategy.query);
    } else if (strategy.type === 'advanced') {
      const results = this.nodeIndex.advancedSearch(strategy.query);
      nodes = results.map(r => r.node);
    }

    return nodes.map(node => ({
      node,
      relevanceScore: 0.8, // Base score
      explanation: strategy.explanation
    }));
  }

  /**
   * Remove duplicates and rank results
   */
  private deduplicateAndRank(results: Array<{node: GraphNode; relevanceScore: number; explanation: string}>): Array<{
    node: GraphNode;
    relevanceScore: number;
    explanation: string;
  }> {
    const seen = new Set<string>();
    const unique: Array<{node: GraphNode; relevanceScore: number; explanation: string}> = [];

    for (const result of results) {
      if (!seen.has(result.node.id)) {
        seen.add(result.node.id);
        unique.push(result);
      }
    }

    return unique.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Detect user intent from query
   */
  private detectIntent(query: string): string {
    if (query.includes('how') || query.includes('what')) return 'understand';
    if (query.includes('add') || query.includes('create')) return 'extend';
    if (query.includes('fix') || query.includes('debug') || query.includes('error')) return 'debug';
    if (query.includes('change') || query.includes('update')) return 'modify';
    return 'understand';
  }

  /**
   * Generate follow-up questions
   */
  private generateFollowUpQuestions(concepts: string[], results: Array<{node: GraphNode}>): string[] {
    const questions: string[] = [];

    if (concepts.includes('api')) {
      questions.push("Would you like to trace how API requests are processed?");
      questions.push("Do you want to see the API error handling flow?");
    }

    if (concepts.includes('data')) {
      questions.push("Would you like to see how data flows through the system?");
      questions.push("Do you want to explore data validation and transformation?");
    }

    if (results.length > 0) {
      questions.push(`Found ${results.length} relevant components. Would you like to explore their relationships?`);
      questions.push("Would you like to see the dependencies of these components?");
    }

    return questions;
  }

  /**
   * Generate suggested actions
   */
  private generateSuggestedActions(concepts: string[], results: Array<{node: GraphNode}>): string[] {
    const actions: string[] = [];

    if (results.length > 0) {
      actions.push(`Found ${results.length} relevant components. Use trace_execution_flow to see how they work together.`);
      actions.push("Use find_dependencies to understand the impact of changes.");
      actions.push("Use explore_graph to discover related functionality.");
    }

    return actions;
  }

  /**
   * Build execution path using graph traversal
   */
  private async buildExecutionPath(
    startNode: GraphNode,
    endPoint?: string,
    maxDepth: number = 5
  ): Promise<GraphNode[]> {
    const path: GraphNode[] = [startNode];
    const visited = new Set<string>([startNode.id]);
    
    let currentNode = startNode;
    let depth = 0;

    while (depth < maxDepth) {
      // Find outgoing calls from current node
      const outgoingConnections = this.nodeIndex.getConnectedNodes(currentNode.id, ['CALLS']);

      if (outgoingConnections.length === 0) break; // No more calls

      // Choose the most relevant next step
      const nextConnection = outgoingConnections.find(conn => !visited.has(conn.node.id));
      if (!nextConnection) break;

      path.push(nextConnection.node);
      visited.add(nextConnection.node.id);
      currentNode = nextConnection.node;
      depth++;

      // Check if we reached the end point
      if (endPoint && (nextConnection.node.name === endPoint || nextConnection.node.id === endPoint)) {
        break;
      }
    }

    return path;
  }

  /**
   * Infer step type from node characteristics
   */
  private inferStepType(node: GraphNode): 'entry' | 'call' | 'data_transform' | 'decision' | 'exit' {
    if (node.metadata?.isEntryPoint) return 'entry';
    if (node.metadata?.isExitPoint) return 'exit';
    if (node.type === 'Function' || node.type === 'Method') return 'call';
    if (node.name.includes('transform') || node.name.includes('convert')) return 'data_transform';
    if (node.name.includes('if') || node.name.includes('check') || node.name.includes('validate')) return 'decision';
    return 'call';
  }

  /**
   * Generate step description
   */
  private generateStepDescription(node: GraphNode): string {
    const baseDescription = `Execute ${node.name}`;
    
    if (node.metadata?.documentation) {
      return `${baseDescription} - ${node.metadata.documentation}`;
    }
    
    // Generate description based on name patterns
    if (node.name.includes('validate')) {
      return `${baseDescription} - Validates input data`;
    }
    if (node.name.includes('process')) {
      return `${baseDescription} - Processes business logic`;
    }
    if (node.name.includes('save') || node.name.includes('store')) {
      return `${baseDescription} - Persists data to storage`;
    }
    
    return baseDescription;
  }

  /**
   * Infer data state at this step
   */
  private inferDataState(node: GraphNode): any {
    // This would be enhanced with actual data flow analysis
    return {
      description: `Data state after ${node.name}`,
      type: node.metadata?.returnType || 'unknown'
    };
  }

  /**
   * Infer conditions for this step
   */
  private inferConditions(node: GraphNode): string[] {
    const conditions: string[] = [];
    
    if (node.name.includes('validate')) {
      conditions.push('Input data is valid');
    }
    if (node.name.includes('authorize') || node.name.includes('auth')) {
      conditions.push('User is authorized');
    }
    
    return conditions;
  }

  /**
   * Generate flow summary
   */
  private generateFlowSummary(path: GraphNode[], startPoint: string): string {
    if (path.length === 0) return `No execution path found for ${startPoint}`;
    
    const domains = [...new Set(path.map(node => {
      const parsed = this.nodeIndex.buildLLMContext().systemDescription; // Get domain from ID
      return 'business'; // Simplified for now
    }))];
    
    return `Execution flow for ${startPoint} involves ${path.length} steps across ${domains.length} domain(s): ${domains.join(', ')}`;
  }

  /**
   * Identify potential issues in execution path
   */
  private identifyPotentialIssues(path: GraphNode[]): string[] {
    const issues: string[] = [];
    
    // Check for potential performance issues
    if (path.length > 8) {
      issues.push('Long execution chain - consider breaking into smaller operations');
    }
    
    // Check for missing error handling
    const hasErrorHandling = path.some(node => 
      node.name.includes('error') || node.name.includes('exception')
    );
    if (!hasErrorHandling) {
      issues.push('No error handling detected in execution path');
    }
    
    return issues;
  }

  /**
   * Discover execution branches
   */
  private async discoverExecutionBranches(path: GraphNode[]): Promise<Array<{
    condition: string;
    steps: GraphNode[];
    probability: 'high' | 'medium' | 'low';
  }>> {
    const branches: Array<{condition: string; steps: GraphNode[]; probability: 'high' | 'medium' | 'low'}> = [];
    
    // Look for decision points in the path
    for (const node of path) {
      const outgoingConnections = this.nodeIndex.getConnectedNodes(node.id);
      
      if (outgoingConnections.length > 1) {
        // Multiple paths = decision point
        for (const connection of outgoingConnections) {
          branches.push({
            condition: this.inferBranchCondition(connection.node),
            steps: [connection.node], // Simplified - would trace further
            probability: this.inferBranchProbability(connection.node)
          });
        }
      }
    }
    
    return branches;
  }

  /**
   * Infer branch condition
   */
  private inferBranchCondition(node: GraphNode): string {
    if (node.name.includes('error') || node.name.includes('fail')) {
      return 'Error or failure condition';
    }
    if (node.name.includes('success') || node.name.includes('valid')) {
      return 'Success or valid condition';
    }
    return `Condition leading to ${node.name}`;
  }

  /**
   * Infer branch probability
   */
  private inferBranchProbability(node: GraphNode): 'high' | 'medium' | 'low' {
    if (node.name.includes('error') || node.name.includes('exception')) {
      return 'low';
    }
    if (node.name.includes('success') || node.name.includes('main')) {
      return 'high';
    }
    return 'medium';
  }

  /**
   * Trace data transformations
   */
  private async traceDataTransformations(path: GraphNode[]): Promise<Array<{
    from: string;
    to: string;
    transformation: string;
    node: GraphNode;
  }>> {
    const transformations: Array<{from: string; to: string; transformation: string; node: GraphNode}> = [];
    
    for (let i = 0; i < path.length - 1; i++) {
      const currentNode = path[i];
      const nextNode = path[i + 1];
      
      transformations.push({
        from: currentNode.name,
        to: nextNode.name,
        transformation: `Data flows from ${currentNode.name} to ${nextNode.name}`,
        node: nextNode
      });
    }
    
    return transformations;
  }

  /**
   * Check if node is in critical path
   */
  private isCriticalPath(node: GraphNode, connectionCount: number): boolean {
    // Simple heuristic - nodes with many connections are likely critical
    return connectionCount > 5;
  }

  /**
   * Generate architecture insights
   */
  private generateArchitectureInsights(core: GraphNode[], related: GraphNode[]): string[] {
    const insights: string[] = [];
    
    const coreTypes = [...new Set(core.map(n => n.type))];
    const totalComponents = core.length + related.length;
    
    insights.push(`Architecture involves ${totalComponents} components with ${coreTypes.length} different types`);
    
    if (coreTypes.includes('Interface')) {
      insights.push('Well-designed with clear interface definitions');
    }
    
    if (core.length > related.length) {
      insights.push('Highly cohesive module with strong internal connections');
    }
    
    return insights;
  }

  /**
   * Generate exploration suggestions
   */
  private generateExplorationSuggestions(core: GraphNode[], related: GraphNode[]): string[] {
    const suggestions: string[] = [];
    
    suggestions.push('Use trace_execution_flow to see how these components work together');
    suggestions.push('Use find_dependencies to understand component relationships');
    
    if (related.length > 0) {
      suggestions.push('Explore related components to understand system boundaries');
    }
    
    return suggestions;
  }
}
